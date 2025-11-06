import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Plus, Send, Trash2, Edit, FileText, Image, Video, FileType } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Contact = {
  id: number;
  phonebookId: number;
  phone: string;
  name: string;
  email: string | null;
  messageType: string;
  body: string;
  mediaUrl: string | null;
  button1Text: string | null;
  button1Type: string | null;
  button1Value: string | null;
  button1Id: string | null;
  button2Text: string | null;
  button2Type: string | null;
  button2Value: string | null;
  button2Id: string | null;
  button3Text: string | null;
  button3Type: string | null;
  button3Value: string | null;
  button3Id: string | null;
  createdAt: string;
};

type Phonebook = {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  createdAt: string;
  contacts: Contact[];
};

export default function PhonebookDetailPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/phonebooks/:id");
  const phonebookId = params?.id ? parseInt(params.id) : null;
  
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  // Fetch phonebook with contacts
  const { data: phonebook, isLoading } = useQuery<Phonebook>({
    queryKey: ["/api/phonebooks", phonebookId],
    enabled: !!phonebookId,
  });

  // Fetch user's active channels
  const { data: channels = [] } = useQuery<any[]>({
    queryKey: ["/api/channels"],
  });

  const activeChannels = channels.filter((ch: any) => ch.status === "ACTIVE");

  // Delete contact mutation
  const deleteContact = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/contacts/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phonebooks", phonebookId] });
      setDeleteDialogOpen(false);
      setContactToDelete(null);
      toast({
        title: "Success",
        description: "Contact deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete contact",
        variant: "destructive",
      });
    },
  });

  // Send to phonebook mutation
  const sendToPhonebook = useMutation({
    mutationFn: async (channelId: string) => {
      const res = await apiRequest("POST", `/api/phonebooks/${phonebookId}/send`, { 
        channelId: parseInt(channelId) 
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setSendDialogOpen(false);
      toast({
        title: "Success",
        description: `Bulk job created with ${data.total} messages. Check the Outbox for status.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send messages",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (contact: Contact) => {
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (contactToDelete) {
      deleteContact.mutate(contactToDelete.id);
    }
  };

  const handleSendClick = () => {
    if (!selectedChannelId) {
      toast({
        title: "Validation Error",
        description: "Please select a channel",
        variant: "destructive",
      });
      return;
    }
    setSendDialogOpen(true);
  };

  const confirmSend = () => {
    sendToPhonebook.mutate(selectedChannelId);
  };

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case "image":
      case "image_buttons":
        return <Image className="w-4 h-4" />;
      case "video_buttons":
        return <Video className="w-4 h-4" />;
      case "document":
        return <FileType className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getMessageTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      text_buttons: "Text + Buttons",
      image: "Image Only",
      image_buttons: "Image + Buttons",
      video_buttons: "Video + Buttons",
      document: "Document",
    };
    return labels[type] || type;
  };

  if (!phonebookId) {
    return <div className="p-8">Invalid phonebook ID</div>;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!phonebook) {
    return (
      <div className="p-8">
        <p className="text-destructive">Phonebook not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/phonebooks">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Phonebooks
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold mb-2" data-testid="text-phonebook-name">
                {phonebook.name}
              </h1>
              {phonebook.description && (
                <p className="text-sm text-secondary" data-testid="text-phonebook-description">
                  {phonebook.description}
                </p>
              )}
              <p className="text-xs text-tertiary mt-1">
                {phonebook.contacts.length} contact{phonebook.contacts.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" data-testid="button-add-contact">
                <Plus className="w-4 h-4 mr-2" />
                Add Contact
              </Button>
            </div>
          </div>
        </div>

        {/* Send to All Section */}
        {phonebook.contacts.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Send to All Contacts</CardTitle>
              <CardDescription>
                Send the pre-configured messages to all {phonebook.contacts.length} contact{phonebook.contacts.length !== 1 ? "s" : ""} in this phonebook
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                    <SelectTrigger data-testid="select-channel">
                      <SelectValue placeholder="Select a channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeChannels.length === 0 && (
                        <div className="p-2 text-sm text-muted-foreground">No active channels</div>
                      )}
                      {activeChannels.map((channel: any) => (
                        <SelectItem key={channel.id} value={channel.id.toString()} data-testid={`option-channel-${channel.id}`}>
                          {channel.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleSendClick}
                  disabled={!selectedChannelId || activeChannels.length === 0}
                  data-testid="button-send-to-all"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send to All
                </Button>
              </div>
              {activeChannels.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  You need at least one active channel to send messages
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Contacts Table */}
        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
            <CardDescription>
              Manage contacts and their personalized messages
            </CardDescription>
          </CardHeader>
          <CardContent>
            {phonebook.contacts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground mb-4">No contacts in this phonebook yet</p>
                <Button data-testid="button-add-first-contact">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Contact
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Message Type</TableHead>
                      <TableHead>Message Preview</TableHead>
                      <TableHead>Buttons</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {phonebook.contacts.map((contact) => (
                      <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                        <TableCell className="font-mono text-sm" data-testid={`text-phone-${contact.id}`}>
                          {contact.phone}
                        </TableCell>
                        <TableCell data-testid={`text-name-${contact.id}`}>
                          {contact.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            {getMessageTypeIcon(contact.messageType)}
                            <span className="text-xs">{getMessageTypeLabel(contact.messageType)}</span>
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-sm truncate" data-testid={`text-body-${contact.id}`}>
                            {contact.body}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {contact.button1Text && (
                              <Badge variant="secondary" className="text-xs w-fit">
                                {contact.button1Text}
                              </Badge>
                            )}
                            {contact.button2Text && (
                              <Badge variant="secondary" className="text-xs w-fit">
                                {contact.button2Text}
                              </Badge>
                            )}
                            {contact.button3Text && (
                              <Badge variant="secondary" className="text-xs w-fit">
                                {contact.button3Text}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-edit-contact-${contact.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(contact)}
                              data-testid={`button-delete-contact-${contact.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Contact Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent data-testid="dialog-delete-contact">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Contact?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {contactToDelete?.name} ({contactToDelete?.phone})? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteContact.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Send Confirmation Dialog */}
        <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <AlertDialogContent data-testid="dialog-send-confirmation">
            <AlertDialogHeader>
              <AlertDialogTitle>Send to All Contacts?</AlertDialogTitle>
              <AlertDialogDescription>
                This will send personalized messages to all {phonebook.contacts.length} contact{phonebook.contacts.length !== 1 ? "s" : ""} in this phonebook. Messages will be queued and sent according to your bulk sending speed settings.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-send">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmSend}
                data-testid="button-confirm-send"
              >
                {sendToPhonebook.isPending ? "Sending..." : "Send Messages"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
