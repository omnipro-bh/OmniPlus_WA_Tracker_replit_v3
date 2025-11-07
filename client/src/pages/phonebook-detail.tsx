import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Plus, Send, Trash2, Edit, FileText, Image, Video, FileType, Upload, X, Download, FileUp } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
  header: string | null;
  body: string;
  footer: string | null;
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
  
  // CSV Import state
  const [csvImportDialogOpen, setCsvImportDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvImportResults, setCsvImportResults] = useState<{
    total: number;
    valid: number;
    invalid: number;
    inserted: number;
    skipped?: number;
    invalidRows?: { row: number; errors: string[] }[];
  } | null>(null);
  const [csvLimitWarning, setCsvLimitWarning] = useState<string | null>(null);
  
  // Contact form dialog state
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactForm, setContactForm] = useState({
    phone: "",
    name: "",
    email: "",
    messageType: "text_buttons",
    body: "",
    mediaUrl: "",
    button1Text: "",
    button1Type: "quick_reply",
    button1Value: "",
    button1Id: "",
    button2Text: "",
    button2Type: "quick_reply",
    button2Value: "",
    button2Id: "",
    button3Text: "",
    button3Type: "quick_reply",
    button3Value: "",
    button3Id: "",
  });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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

  // CSV import mutation
  const importCSV = useMutation({
    mutationFn: async (csvData: string) => {
      const res = await apiRequest("POST", `/api/phonebooks/${phonebookId}/import-csv`, { csvData });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/phonebooks", phonebookId] });
      setCsvImportResults(data.summary);
      setCsvLimitWarning(data.limitWarning || null);
      setCsvFile(null);
      
      let description = `Successfully imported ${data.summary.inserted} of ${data.summary.total} contacts`;
      if (data.summary.skipped > 0) {
        description += `. ${data.summary.skipped} contact(s) skipped due to plan limit.`;
      }
      
      toast({
        title: "CSV Import Complete",
        description,
        variant: data.summary.skipped > 0 ? "default" : "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to import CSV",
        variant: "destructive",
      });
    },
  });

  // Create/update contact mutation
  const saveContact = useMutation({
    mutationFn: async (data: any) => {
      if (editingContact) {
        const res = await apiRequest("PUT", `/api/contacts/${editingContact.id}`, data);
        return await res.json();
      } else {
        const res = await apiRequest("POST", `/api/phonebooks/${phonebookId}/contacts`, data);
        return await res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phonebooks", phonebookId] });
      setContactDialogOpen(false);
      resetContactForm();
      toast({
        title: "Success",
        description: editingContact ? "Contact updated successfully" : "Contact created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save contact",
        variant: "destructive",
      });
    },
  });

  // File upload mutation
  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      return new Promise<{ mediaId: string; url: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = reader.result as string;
            const fileType = contactForm.messageType.includes("image") ? "image" : 
                           contactForm.messageType.includes("video") ? "video" : "document";
            
            const res = await apiRequest("POST", "/api/media/upload", {
              file: base64,
              fileType,
              fileName: file.name,
            });
            const data = await res.json();
            resolve(data);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    },
    onSuccess: (data) => {
      setContactForm((prev) => ({ ...prev, mediaUrl: data.url }));
      setIsUploading(false);
      toast({
        title: "Success",
        description: "File uploaded successfully",
      });
    },
    onError: (error: Error) => {
      setIsUploading(false);
      toast({
        title: "Upload Error",
        description: error.message || "Failed to upload file",
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

  const resetContactForm = () => {
    setContactForm({
      phone: "",
      name: "",
      email: "",
      messageType: "text_buttons",
      body: "",
      mediaUrl: "",
      button1Text: "",
      button1Type: "quick_reply",
      button1Value: "",
      button1Id: "",
      button2Text: "",
      button2Type: "quick_reply",
      button2Value: "",
      button2Id: "",
      button3Text: "",
      button3Type: "quick_reply",
      button3Value: "",
      button3Id: "",
    });
    setUploadedFile(null);
    setEditingContact(null);
  };

  const handleAddContact = () => {
    resetContactForm();
    setContactDialogOpen(true);
  };

  const handleEditContact = (contact: Contact) => {
    setContactForm({
      phone: contact.phone,
      name: contact.name,
      email: contact.email || "",
      messageType: contact.messageType,
      body: contact.body,
      mediaUrl: contact.mediaUrl || "",
      button1Text: contact.button1Text || "",
      button1Type: contact.button1Type || "quick_reply",
      button1Value: contact.button1Value || "",
      button1Id: contact.button1Id || "",
      button2Text: contact.button2Text || "",
      button2Type: contact.button2Type || "quick_reply",
      button2Value: contact.button2Value || "",
      button2Id: contact.button2Id || "",
      button3Text: contact.button3Text || "",
      button3Type: contact.button3Type || "quick_reply",
      button3Value: contact.button3Value || "",
      button3Id: contact.button3Id || "",
    });
    setEditingContact(contact);
    setContactDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setIsUploading(true);
      uploadFile.mutate(file);
    }
  };

  const handleSaveContact = () => {
    if (!contactForm.phone || !contactForm.name || !contactForm.body) {
      toast({
        title: "Validation Error",
        description: "Phone, name, and message body are required",
        variant: "destructive",
      });
      return;
    }

    // Check if media is required but missing
    const requiresMedia = ["image", "image_buttons", "video_buttons", "document"].includes(contactForm.messageType);
    if (requiresMedia && !contactForm.mediaUrl) {
      toast({
        title: "Validation Error",
        description: "Please upload a file for this message type",
        variant: "destructive",
      });
      return;
    }

    saveContact.mutate(contactForm);
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

  // CSV Import handlers
  const handleImportCSVClick = () => {
    setCsvFile(null);
    setCsvImportResults(null);
    setCsvImportDialogOpen(true);
  };

  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setCsvImportResults(null);
    }
  };

  const handleCSVImport = () => {
    if (!csvFile) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to import",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const csvData = e.target?.result as string;
      importCSV.mutate(csvData);
    };
    reader.onerror = () => {
      toast({
        title: "File read error",
        description: "Failed to read the CSV file",
        variant: "destructive",
      });
    };
    reader.readAsText(csvFile);
  };

  const handleDownloadSampleCSV = async () => {
    try {
      const response = await fetch('/api/phonebooks/sample-csv', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to download sample CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'phonebook-contacts-sample.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download sample CSV",
        variant: "destructive",
      });
    }
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
              <Button variant="outline" onClick={handleAddContact} data-testid="button-add-contact">
                <Plus className="w-4 h-4 mr-2" />
                Add Contact
              </Button>
              <Button variant="outline" onClick={handleImportCSVClick} data-testid="button-import-csv">
                <FileUp className="w-4 h-4 mr-2" />
                Import CSV
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
                <Button onClick={handleAddContact} data-testid="button-add-first-contact">
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
                              onClick={() => handleEditContact(contact)}
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

        {/* Contact Form Dialog */}
        <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-contact-form">
            <DialogHeader>
              <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
              <DialogDescription>
                Configure contact details and message template
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Contact Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    placeholder="+1234567890"
                    data-testid="input-contact-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    placeholder="Contact Name"
                    data-testid="input-contact-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (Optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  placeholder="contact@example.com"
                  data-testid="input-contact-email"
                />
              </div>

              {/* Message Type */}
              <div className="space-y-2">
                <Label htmlFor="messageType">Message Type *</Label>
                <Select
                  value={contactForm.messageType}
                  onValueChange={(value) => setContactForm({ ...contactForm, messageType: value, mediaUrl: "" })}
                >
                  <SelectTrigger data-testid="select-message-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text_buttons">Text + Buttons</SelectItem>
                    <SelectItem value="image">Image Only</SelectItem>
                    <SelectItem value="image_buttons">Image + Buttons</SelectItem>
                    <SelectItem value="video_buttons">Video + Buttons</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* File Upload (for media types) */}
              {["image", "image_buttons", "video_buttons", "document"].includes(contactForm.messageType) && (
                <div className="space-y-2">
                  <Label htmlFor="file">Upload File *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="file"
                      type="file"
                      accept={
                        contactForm.messageType.includes("image") ? "image/*" :
                        contactForm.messageType.includes("video") ? "video/*" :
                        "*/*"
                      }
                      onChange={handleFileSelect}
                      disabled={isUploading}
                      data-testid="input-file-upload"
                    />
                    {isUploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
                    {contactForm.mediaUrl && !isUploading && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setContactForm({ ...contactForm, mediaUrl: "" })}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  {contactForm.mediaUrl && (
                    <p className="text-xs text-muted-foreground">File uploaded successfully</p>
                  )}
                </div>
              )}

              {/* Message Body */}
              <div className="space-y-2">
                <Label htmlFor="body">Message {contactForm.messageType === "text_buttons" ? "Body" : "Caption"} *</Label>
                <Textarea
                  id="body"
                  value={contactForm.body}
                  onChange={(e) => setContactForm({ ...contactForm, body: e.target.value })}
                  placeholder="Enter your message here..."
                  rows={4}
                  data-testid="input-message-body"
                />
              </div>

              {/* Buttons (for button types) */}
              {contactForm.messageType !== "image" && contactForm.messageType !== "document" && (
                <div className="space-y-3">
                  <Label>Buttons (Optional - Up to 3)</Label>
                  
                  {/* Button 1 */}
                  <div className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Button 1</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Button Text"
                        value={contactForm.button1Text}
                        onChange={(e) => setContactForm({ ...contactForm, button1Text: e.target.value })}
                        data-testid="input-button1-text"
                      />
                      <Select
                        value={contactForm.button1Type}
                        onValueChange={(value) => setContactForm({ ...contactForm, button1Type: value })}
                      >
                        <SelectTrigger data-testid="select-button1-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="quick_reply">Quick Reply</SelectItem>
                          <SelectItem value="url">URL</SelectItem>
                          <SelectItem value="call">Call</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {contactForm.button1Type !== "quick_reply" && (
                      <Input
                        placeholder={contactForm.button1Type === "url" ? "https://example.com" : "+1234567890"}
                        value={contactForm.button1Value}
                        onChange={(e) => setContactForm({ ...contactForm, button1Value: e.target.value })}
                        data-testid="input-button1-value"
                      />
                    )}
                    <Input
                      placeholder="Button ID (optional)"
                      value={contactForm.button1Id}
                      onChange={(e) => setContactForm({ ...contactForm, button1Id: e.target.value })}
                      data-testid="input-button1-id"
                    />
                  </div>

                  {/* Button 2 */}
                  <div className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Button 2</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Button Text"
                        value={contactForm.button2Text}
                        onChange={(e) => setContactForm({ ...contactForm, button2Text: e.target.value })}
                        data-testid="input-button2-text"
                      />
                      <Select
                        value={contactForm.button2Type}
                        onValueChange={(value) => setContactForm({ ...contactForm, button2Type: value })}
                      >
                        <SelectTrigger data-testid="select-button2-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="quick_reply">Quick Reply</SelectItem>
                          <SelectItem value="url">URL</SelectItem>
                          <SelectItem value="call">Call</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {contactForm.button2Type !== "quick_reply" && (
                      <Input
                        placeholder={contactForm.button2Type === "url" ? "https://example.com" : "+1234567890"}
                        value={contactForm.button2Value}
                        onChange={(e) => setContactForm({ ...contactForm, button2Value: e.target.value })}
                        data-testid="input-button2-value"
                      />
                    )}
                    <Input
                      placeholder="Button ID (optional)"
                      value={contactForm.button2Id}
                      onChange={(e) => setContactForm({ ...contactForm, button2Id: e.target.value })}
                      data-testid="input-button2-id"
                    />
                  </div>

                  {/* Button 3 */}
                  <div className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Button 3</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Button Text"
                        value={contactForm.button3Text}
                        onChange={(e) => setContactForm({ ...contactForm, button3Text: e.target.value })}
                        data-testid="input-button3-text"
                      />
                      <Select
                        value={contactForm.button3Type}
                        onValueChange={(value) => setContactForm({ ...contactForm, button3Type: value })}
                      >
                        <SelectTrigger data-testid="select-button3-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="quick_reply">Quick Reply</SelectItem>
                          <SelectItem value="url">URL</SelectItem>
                          <SelectItem value="call">Call</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {contactForm.button3Type !== "quick_reply" && (
                      <Input
                        placeholder={contactForm.button3Type === "url" ? "https://example.com" : "+1234567890"}
                        value={contactForm.button3Value}
                        onChange={(e) => setContactForm({ ...contactForm, button3Value: e.target.value })}
                        data-testid="input-button3-value"
                      />
                    )}
                    <Input
                      placeholder="Button ID (optional)"
                      value={contactForm.button3Id}
                      onChange={(e) => setContactForm({ ...contactForm, button3Id: e.target.value })}
                      data-testid="input-button3-id"
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setContactDialogOpen(false)}
                disabled={saveContact.isPending}
                data-testid="button-cancel-contact"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveContact}
                disabled={saveContact.isPending || isUploading}
                data-testid="button-save-contact"
              >
                {saveContact.isPending ? "Saving..." : editingContact ? "Update Contact" : "Add Contact"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CSV Import Dialog */}
        <Dialog open={csvImportDialogOpen} onOpenChange={setCsvImportDialogOpen}>
          <DialogContent className="max-w-2xl" data-testid="dialog-csv-import">
            <DialogHeader>
              <DialogTitle>Import Contacts from CSV</DialogTitle>
              <DialogDescription>
                Upload a CSV file to bulk import contacts into this phonebook
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Download Sample */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Need a template?</p>
                  <p className="text-xs text-muted-foreground">Download a sample CSV to see the expected format</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownloadSampleCSV}
                  data-testid="button-download-sample-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Sample
                </Button>
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label htmlFor="csv-file">Select CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCSVFileChange}
                  data-testid="input-csv-file"
                />
                {csvFile && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {csvFile.name} ({(csvFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>

              {/* CSV Format Info */}
              <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
                <p className="font-medium">CSV Format Requirements:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>phone_number</strong> (required): Must include country code (e.g., +973...)</li>
                  <li><strong>name</strong> (optional): Contact name</li>
                  <li><strong>email</strong> (optional): Contact email</li>
                  <li><strong>header</strong>, <strong>body</strong>, <strong>footer</strong> (optional): Message parts</li>
                  <li><strong>button1_text</strong>, <strong>button2_text</strong>, <strong>button3_text</strong> (optional): Button labels</li>
                  <li><strong>button1_id</strong>, <strong>button2_id</strong>, <strong>button3_id</strong> (optional): Button IDs (auto-generated if empty)</li>
                </ul>
              </div>

              {/* Import Results */}
              {csvImportResults && (
                <div className="p-4 border rounded-lg space-y-3">
                  <h3 className="font-medium text-sm">Import Summary</h3>
                  
                  {/* Limit Warning */}
                  {csvLimitWarning && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded">
                      <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                        {csvLimitWarning}
                      </p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <span className="text-muted-foreground">Total Rows:</span>
                      <span className="font-medium">{csvImportResults.total}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-green-500/10 rounded">
                      <span className="text-muted-foreground">Valid:</span>
                      <span className="font-medium text-green-600 dark:text-green-400">{csvImportResults.valid}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-red-500/10 rounded">
                      <span className="text-muted-foreground">Invalid:</span>
                      <span className="font-medium text-red-600 dark:text-red-400">{csvImportResults.invalid}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-blue-500/10 rounded">
                      <span className="text-muted-foreground">Inserted:</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">{csvImportResults.inserted}</span>
                    </div>
                    {csvImportResults.skipped !== undefined && csvImportResults.skipped > 0 && (
                      <div className="flex items-center justify-between p-2 bg-amber-500/10 rounded col-span-2">
                        <span className="text-muted-foreground">Skipped (Plan Limit):</span>
                        <span className="font-medium text-amber-600 dark:text-amber-400">{csvImportResults.skipped}</span>
                      </div>
                    )}
                  </div>

                  {/* Invalid Rows Details */}
                  {csvImportResults.invalidRows && csvImportResults.invalidRows.length > 0 && (
                    <div className="mt-3 p-3 bg-red-500/5 border border-red-500/20 rounded">
                      <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Invalid Rows:</p>
                      <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
                        {csvImportResults.invalidRows.map((invalid, index) => (
                          <div key={index} className="text-muted-foreground">
                            Row {invalid.row}: {invalid.errors.join(", ")}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCsvImportDialogOpen(false)}
                disabled={importCSV.isPending}
                data-testid="button-cancel-csv-import"
              >
                {csvImportResults ? "Close" : "Cancel"}
              </Button>
              {!csvImportResults && (
                <Button
                  onClick={handleCSVImport}
                  disabled={!csvFile || importCSV.isPending}
                  data-testid="button-import-csv-submit"
                >
                  {importCSV.isPending ? "Importing..." : "Import Contacts"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
