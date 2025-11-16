import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Download, Users, Edit, Trash2, Filter, UserCheck, UserMinus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Subscriber = {
  id: number;
  userId: number;
  phone: string;
  name: string | null;
  status: "subscribed" | "unsubscribed";
  lastUpdated: string;
};

type SubscriberResponse = {
  subscribers: Subscriber[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export default function SubscribersPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"all" | "subscribed" | "unsubscribed">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [subscriberToEdit, setSubscriberToEdit] = useState<Subscriber | null>(null);
  const [editedName, setEditedName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subscriberToDelete, setSubscriberToDelete] = useState<Subscriber | null>(null);

  // Fetch subscribers with pagination and optional status filter
  const queryKey = statusFilter === "all" 
    ? ["/api/subscribers", { page: currentPage, pageSize }]
    : ["/api/subscribers", { status: statusFilter, page: currentPage, pageSize }];
  
  const { data, isLoading } = useQuery<SubscriberResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      const url = `/api/subscribers?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch subscribers");
      return res.json();
    },
  });

  const subscribers = data?.subscribers || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  // Update subscriber mutation
  const updateSubscriber = useMutation({
    mutationFn: async (data: { id: number; name: string }) => {
      const res = await apiRequest("PUT", `/api/subscribers/${data.id}`, { name: data.name });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
      setEditDialogOpen(false);
      setSubscriberToEdit(null);
      setEditedName("");
      toast({
        title: "Success",
        description: "Subscriber updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update subscriber",
        variant: "destructive",
      });
    },
  });

  // Delete subscriber mutation
  const deleteSubscriber = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/subscribers/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
      setDeleteDialogOpen(false);
      setSubscriberToDelete(null);
      toast({
        title: "Success",
        description: "Subscriber deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete subscriber",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = (subscriber: Subscriber) => {
    setSubscriberToEdit(subscriber);
    setEditedName(subscriber.name || "");
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (subscriber: Subscriber) => {
    setSubscriberToDelete(subscriber);
    setDeleteDialogOpen(true);
  };

  const confirmEdit = () => {
    if (subscriberToEdit) {
      updateSubscriber.mutate({
        id: subscriberToEdit.id,
        name: editedName.trim() || subscriberToEdit.phone,
      });
    }
  };

  const confirmDelete = () => {
    if (subscriberToDelete) {
      deleteSubscriber.mutate(subscriberToDelete.id);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch("/api/subscribers/export", {
        credentials: "include",
      });
      
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subscribers-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Success",
        description: "Subscribers exported successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to export subscribers",
        variant: "destructive",
      });
    }
  };

  const handleFilterChange = (value: string) => {
    setStatusFilter(value as typeof statusFilter);
    setCurrentPage(1); // Reset to first page on filter change
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold mb-2" data-testid="text-page-title">Subscribers</h1>
              <p className="text-sm text-secondary">
                Manage users who subscribed or unsubscribed via button interactions
              </p>
            </div>
            <Button
              onClick={handleExport}
              variant="outline"
              disabled={total === 0}
              data-testid="button-export-subscribers"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {/* Stats and Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-3">
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <div>
                    <div className="text-xs text-secondary">Total {statusFilter !== "all" && `(${statusFilter})`}</div>
                    <div className="text-lg font-semibold" data-testid="text-total-count">{total}</div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-secondary" />
              <Select value={statusFilter} onValueChange={handleFilterChange}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subscribers</SelectItem>
                  <SelectItem value="subscribed">Subscribed Only</SelectItem>
                  <SelectItem value="unsubscribed">Unsubscribed Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && subscribers.length === 0 && (
          <Card className="p-12 text-center">
            <div className="flex justify-center mb-4">
              <Users className="w-16 h-16 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No subscribers yet</h3>
            <p className="text-sm text-secondary mb-2">
              Subscribers will appear here when users interact with subscription buttons
            </p>
            <p className="text-xs text-tertiary">
              Configure subscription keywords in Admin Settings
            </p>
          </Card>
        )}

        {/* Subscribers Table */}
        {!isLoading && subscribers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>All Subscribers ({total})</CardTitle>
              <CardDescription>
                View and manage all users who interacted with subscription buttons
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-medium text-secondary">Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-secondary">Phone</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-secondary">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-secondary">Last Updated</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-secondary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscribers.map((subscriber) => (
                      <tr 
                        key={subscriber.id} 
                        className="border-b hover-elevate"
                        data-testid={`row-subscriber-${subscriber.id}`}
                      >
                        <td className="py-3 px-4" data-testid={`text-subscriber-name-${subscriber.id}`}>
                          {subscriber.name || <span className="text-tertiary italic">Unknown</span>}
                        </td>
                        <td className="py-3 px-4 font-mono text-sm" data-testid={`text-subscriber-phone-${subscriber.id}`}>
                          {subscriber.phone}
                        </td>
                        <td className="py-3 px-4" data-testid={`badge-subscriber-status-${subscriber.id}`}>
                          {subscriber.status === "subscribed" ? (
                            <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20">
                              Subscribed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                              Unsubscribed
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-secondary" data-testid={`text-subscriber-updated-${subscriber.id}`}>
                          {new Date(subscriber.lastUpdated).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditClick(subscriber)}
                              data-testid={`button-edit-subscriber-${subscriber.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(subscriber)}
                              data-testid={`button-delete-subscriber-${subscriber.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="text-sm text-secondary" data-testid="text-page-info">
                    Page {currentPage} of {totalPages} ({total} total)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || isLoading}
                      data-testid="button-previous-page"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || isLoading}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Edit Subscriber Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent data-testid="dialog-edit-subscriber">
            <DialogHeader>
              <DialogTitle>Edit Subscriber</DialogTitle>
              <DialogDescription>
                Update the display name for this subscriber
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={subscriberToEdit?.phone || ""}
                  disabled
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  placeholder="Enter subscriber name"
                  data-testid="input-edit-subscriber-name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={updateSubscriber.isPending}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmEdit}
                disabled={updateSubscriber.isPending}
                data-testid="button-confirm-edit"
              >
                {updateSubscriber.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent data-testid="dialog-delete-confirmation">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Subscriber?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {subscriberToDelete?.name || subscriberToDelete?.phone}? 
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteSubscriber.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
