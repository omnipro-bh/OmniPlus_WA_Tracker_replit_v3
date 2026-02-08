import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Link } from "wouter";
import { Plus, Book, Trash2, Users, Edit, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
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

type Phonebook = {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  createdAt: string;
  contactCount?: number;
};

export default function PhonebooksPage() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPhonebookName, setNewPhonebookName] = useState("");
  const [newPhonebookDescription, setNewPhonebookDescription] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [phonebookToDelete, setPhonebookToDelete] = useState<Phonebook | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch current user info for feature flags
  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/me"],
  });

  const contactExportEnabled = currentUser?.contactExportAllowed || currentUser?.currentPlan?.contactExportEnabled;

  const handleExportContacts = async () => {
    setIsExporting(true);
    try {
      const res = await apiRequest("GET", "/api/phonebooks/export-contacts");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "whatsapp-contacts.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Contacts exported successfully" });
    } catch (error: any) {
      const errorMsg = error?.message || "Failed to export contacts";
      toast({ title: "Export failed", description: errorMsg, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  // Fetch phonebooks
  const { data: phonebooks = [], isLoading } = useQuery<Phonebook[]>({
    queryKey: ["/api/phonebooks"],
  });

  // Create phonebook mutation
  const createPhonebook = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/phonebooks", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phonebooks"] });
      setCreateDialogOpen(false);
      setNewPhonebookName("");
      setNewPhonebookDescription("");
      toast({
        title: "Success",
        description: "Phonebook created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create phonebook",
        variant: "destructive",
      });
    },
  });

  // Delete phonebook mutation
  const deletePhonebook = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/phonebooks/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phonebooks"] });
      setDeleteDialogOpen(false);
      setPhonebookToDelete(null);
      toast({
        title: "Success",
        description: "Phonebook deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete phonebook",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (!newPhonebookName.trim()) {
      toast({
        title: "Validation Error",
        description: "Phonebook name is required",
        variant: "destructive",
      });
      return;
    }
    createPhonebook.mutate({
      name: newPhonebookName,
      description: newPhonebookDescription,
    });
  };

  const handleDeleteClick = (phonebook: Phonebook) => {
    setPhonebookToDelete(phonebook);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (phonebookToDelete) {
      deletePhonebook.mutate(phonebookToDelete.id);
    }
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold mb-2" data-testid="text-page-title">Phonebooks</h1>
            <p className="text-sm text-muted-foreground">Manage your contact phonebooks and send messages to groups</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {contactExportEnabled && (
              <Button
                variant="outline"
                onClick={handleExportContacts}
                disabled={isExporting}
                data-testid="button-export-contacts"
              >
                <Download className="w-4 h-4 mr-2" />
                {isExporting ? "Exporting..." : "Export Contacts"}
              </Button>
            )}
            <Button
              onClick={() => setCreateDialogOpen(true)}
              data-testid="button-create-phonebook"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Phonebook
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && phonebooks.length === 0 && (
          <Card className="p-12 text-center">
            <div className="flex justify-center mb-4">
              <Book className="w-16 h-16 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No phonebooks yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first phonebook to organize contacts and send group messages
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-phonebook">
              <Plus className="w-4 h-4 mr-2" />
              Create Phonebook
            </Button>
          </Card>
        )}

        {/* Phonebooks Grid */}
        {!isLoading && phonebooks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {phonebooks.map((phonebook) => (
              <Card key={phonebook.id} className="hover-elevate" data-testid={`card-phonebook-${phonebook.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Book className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg" data-testid={`text-phonebook-name-${phonebook.id}`}>
                          {phonebook.name}
                        </CardTitle>
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          <span data-testid={`text-contact-count-${phonebook.id}`}>
                            {phonebook.contactCount || 0} contacts
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {phonebook.description && (
                    <CardDescription className="mt-3 line-clamp-2" data-testid={`text-phonebook-description-${phonebook.id}`}>
                      {phonebook.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardFooter className="flex items-center gap-2 pt-4 border-t">
                  <Link href={`/phonebooks/${phonebook.id}`} className="flex-1">
                    <Button variant="default" className="w-full" data-testid={`button-view-phonebook-${phonebook.id}`}>
                      <Edit className="w-4 h-4 mr-2" />
                      Manage
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDeleteClick(phonebook)}
                    data-testid={`button-delete-phonebook-${phonebook.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Create Phonebook Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent data-testid="dialog-create-phonebook">
            <DialogHeader>
              <DialogTitle>Create New Phonebook</DialogTitle>
              <DialogDescription>
                Create a phonebook to organize your contacts and send bulk messages
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Phonebook Name *</Label>
                <Input
                  id="name"
                  value={newPhonebookName}
                  onChange={(e) => setNewPhonebookName(e.target.value)}
                  placeholder="e.g., Customer List, VIP Contacts"
                  data-testid="input-phonebook-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={newPhonebookDescription}
                  onChange={(e) => setNewPhonebookDescription(e.target.value)}
                  placeholder="Brief description of this phonebook..."
                  rows={3}
                  data-testid="input-phonebook-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={createPhonebook.isPending}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createPhonebook.isPending}
                data-testid="button-confirm-create"
              >
                {createPhonebook.isPending ? "Creating..." : "Create Phonebook"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent data-testid="dialog-delete-confirmation">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Phonebook?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{phonebookToDelete?.name}"? This will also delete all contacts in this phonebook. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deletePhonebook.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
