import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Plus, History, TrendingUp, TrendingDown, ArrowRight, ArrowLeftRight, Minus, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface BalanceTransaction {
  id: number;
  type: "topup" | "allocate" | "refund" | "sync" | "adjustment";
  days: number;
  channelId: number | null;
  userId: number | null;
  note: string;
  createdAt: string;
  user: { id: number; name: string; email: string } | null;
  channel: { id: number; label: string } | null;
}

export default function AdminBalances() {
  const { toast } = useToast();
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isRemoveDaysOpen, setIsRemoveDaysOpen] = useState(false);
  const [topUpDays, setTopUpDays] = useState("100");
  const [topUpNote, setTopUpNote] = useState("");
  const [removeDays, setRemoveDays] = useState("10");
  const [removeNote, setRemoveNote] = useState("");

  // Fetch main balance
  const { data: balanceData, isLoading: balanceLoading } = useQuery<{ balance: number }>({
    queryKey: ["/api/admin/balance"],
  });

  // Fetch transactions
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery<BalanceTransaction[]>({
    queryKey: ["/api/admin/balance/transactions"],
  });

  // Top up mutation
  const topUpMutation = useMutation({
    mutationFn: async (data: { days: number; note?: string }) => {
      return await apiRequest("POST", "/api/admin/balance/topup", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balance/transactions"] });
      setIsTopUpOpen(false);
      setTopUpDays("100");
      setTopUpNote("");
      toast({
        title: "Success",
        description: "Main balance topped up successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to top up balance",
        variant: "destructive",
      });
    },
  });

  // Remove days mutation
  const removeDaysMutation = useMutation({
    mutationFn: async (data: { days: number; note?: string }) => {
      return await apiRequest("POST", "/api/admin/balance/adjust", { days: -data.days, note: data.note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balance/transactions"] });
      setIsRemoveDaysOpen(false);
      setRemoveDays("10");
      setRemoveNote("");
      toast({
        title: "Success",
        description: "Days removed from main balance successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove days",
        variant: "destructive",
      });
    },
  });

  // Delete transaction mutation
  const deleteTransactionMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      return await apiRequest("DELETE", `/api/admin/balance/transactions/${transactionId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balance/transactions"] });
      toast({
        title: "Success",
        description: "Transaction deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete transaction",
        variant: "destructive",
      });
    },
  });

  const handleTopUp = () => {
    const days = parseInt(topUpDays);
    if (days < 1 || isNaN(days)) {
      toast({
        title: "Invalid input",
        description: "Days must be at least 1",
        variant: "destructive",
      });
      return;
    }

    topUpMutation.mutate({ days, note: topUpNote || undefined });
  };

  const handleRemoveDays = () => {
    const days = parseInt(removeDays);
    if (days < 1 || isNaN(days)) {
      toast({
        title: "Invalid input",
        description: "Days must be at least 1",
        variant: "destructive",
      });
      return;
    }

    if (balanceData && days > balanceData.balance) {
      toast({
        title: "Invalid input",
        description: `Cannot remove more than ${balanceData.balance} days`,
        variant: "destructive",
      });
      return;
    }

    removeDaysMutation.mutate({ days, note: removeNote || undefined });
  };

  const handleDeleteTransaction = (id: number) => {
    if (confirm("Are you sure you want to delete this transaction? This action cannot be undone.")) {
      deleteTransactionMutation.mutate(id);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "topup":
        return <TrendingUp className="h-4 w-4 text-success" />;
      case "allocate":
        return <TrendingDown className="h-4 w-4 text-warning" />;
      case "refund":
        return <TrendingUp className="h-4 w-4 text-info" />;
      case "sync":
        return <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />;
      case "adjustment":
        return <Minus className="h-4 w-4 text-destructive" />;
      default:
        return <ArrowRight className="h-4 w-4" />;
    }
  };

  const getTransactionBadge = (type: string) => {
    const variants = {
      topup: "default",
      allocate: "secondary",
      refund: "outline",
      sync: "outline",
      adjustment: "destructive",
    } as const;

    return (
      <Badge variant={variants[type as keyof typeof variants] || "default"}>
        {type.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Balance</h1>
          <p className="text-muted-foreground">
            Manage the main days balance for channel activations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsRemoveDaysOpen(true)} data-testid="button-open-remove-days">
            <Minus className="h-4 w-4 mr-2" />
            Remove Days
          </Button>
          <Button onClick={() => setIsTopUpOpen(true)} data-testid="button-open-topup">
            <Plus className="h-4 w-4 mr-2" />
            Top Up Balance
          </Button>
        </div>
      </div>

      {/* Main Balance Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Main Balance
              </CardTitle>
              <CardDescription>
                Available days for channel activations
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {balanceLoading ? (
            <div className="text-4xl font-bold text-muted-foreground">Loading...</div>
          ) : (
            <div className="space-y-2">
              <div className="text-5xl font-bold text-success" data-testid="text-main-balance">
                {balanceData?.balance || 0}
              </div>
              <div className="text-lg text-muted-foreground">days</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Transaction History
              </CardTitle>
              <CardDescription>
                Recent balance transactions (allocations, refunds, top-ups)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions yet
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id} data-testid={`row-transaction-${tx.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTransactionIcon(tx.type)}
                          {getTransactionBadge(tx.type)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={tx.type === "allocate" || tx.type === "adjustment" ? "text-warning" : "text-success"}>
                          {tx.type === "allocate" || tx.type === "adjustment" ? "-" : "+"}{tx.days}
                        </span>
                      </TableCell>
                      <TableCell>
                        {tx.user ? (
                          <div>
                            <div className="font-medium">{tx.user.name}</div>
                            <div className="text-xs text-muted-foreground">{tx.user.email}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tx.channel ? (
                          <span className="font-medium">{tx.channel.label}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{tx.note}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(tx.createdAt), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTransaction(tx.id)}
                          disabled={deleteTransactionMutation.isPending}
                          data-testid={`button-delete-transaction-${tx.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Up Dialog */}
      <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top Up Main Balance</DialogTitle>
            <DialogDescription>
              Add days to the main admin balance for channel activations
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="topup-days">Number of Days</Label>
              <Input
                id="topup-days"
                type="number"
                min="1"
                placeholder="Enter days"
                value={topUpDays}
                onChange={(e) => setTopUpDays(e.target.value)}
                data-testid="input-topup-days"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Recommended: 100 days minimum
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topup-note">Note (optional)</Label>
              <Input
                id="topup-note"
                type="text"
                placeholder="e.g., Monthly top-up"
                value={topUpNote}
                onChange={(e) => setTopUpNote(e.target.value)}
                data-testid="input-topup-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsTopUpOpen(false);
                setTopUpDays("100");
                setTopUpNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTopUp}
              disabled={!topUpDays || parseInt(topUpDays) < 1 || topUpMutation.isPending}
              data-testid="button-confirm-topup"
            >
              <Plus className="h-3 w-3 mr-1" />
              Top Up Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Days Dialog */}
      <Dialog open={isRemoveDaysOpen} onOpenChange={setIsRemoveDaysOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Days from Main Balance</DialogTitle>
            <DialogDescription>
              Subtract days from the main admin balance
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-warning/10 border border-warning/20 rounded-md p-4">
              <p className="text-sm text-warning font-medium">
                Current Balance: {balanceData?.balance || 0} days
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                You can remove up to {balanceData?.balance || 0} days
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="remove-days">Number of Days to Remove</Label>
              <Input
                id="remove-days"
                type="number"
                min="1"
                max={balanceData?.balance || 0}
                placeholder="Enter days"
                value={removeDays}
                onChange={(e) => setRemoveDays(e.target.value)}
                data-testid="input-remove-days"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remove-note">Note (optional)</Label>
              <Input
                id="remove-note"
                type="text"
                placeholder="e.g., Balance correction"
                value={removeNote}
                onChange={(e) => setRemoveNote(e.target.value)}
                data-testid="input-remove-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsRemoveDaysOpen(false);
                setRemoveDays("10");
                setRemoveNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveDays}
              disabled={!removeDays || parseInt(removeDays) < 1 || removeDaysMutation.isPending}
              data-testid="button-confirm-remove-days"
            >
              <Minus className="h-3 w-3 mr-1" />
              Remove Days
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
