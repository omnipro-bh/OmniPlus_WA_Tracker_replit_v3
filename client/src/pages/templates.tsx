import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash2, FileText } from "lucide-react";
import type { Template } from "@shared/schema";

export default function Templates() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    header: "",
    body: "",
    footer: "",
    buttons: ["", "", ""],
  });

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const buttons = data.buttons.filter((b: string) => b.trim() !== "");
      return await apiRequest("POST", "/api/templates", { ...data, buttons });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Template created", description: "Template saved successfully." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const buttons = data.buttons.filter((b: string) => b.trim() !== "");
      return await apiRequest("PUT", `/api/templates/${id}`, { ...data, buttons });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Template updated", description: "Changes saved successfully." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/templates/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template deleted" });
    },
  });

  const resetForm = () => {
    setFormData({ title: "", header: "", body: "", footer: "", buttons: ["", "", ""] });
    setEditingTemplate(null);
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      title: template.title,
      header: template.header || "",
      body: template.body,
      footer: template.footer || "",
      buttons: [
        template.buttons[0] || "",
        template.buttons[1] || "",
        template.buttons[2] || "",
      ],
    });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold">Templates</h1>
          <p className="text-muted-foreground mt-1">
            Create reusable message templates for quick sending
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-create-template">
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No templates yet</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Create your first template to reuse message formats
            </p>
            <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} data-testid={`template-${template.id}`}>
              <CardHeader>
                <CardTitle className="text-lg">{template.title}</CardTitle>
                {template.header && (
                  <CardDescription className="font-semibold">{template.header}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3">{template.body}</p>
                {template.footer && (
                  <p className="text-xs text-muted-foreground mt-2">{template.footer}</p>
                )}
                {template.buttons.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {template.buttons.map((button, index) => (
                      <span
                        key={index}
                        className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                      >
                        {button}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(template)}
                  data-testid={`button-edit-${template.id}`}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm("Delete this template?")) {
                      deleteMutation.mutate(template.id);
                    }
                  }}
                  data-testid={`button-delete-${template.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
            <DialogDescription>
              Design a reusable message template with header, body, footer and buttons
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Template Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Payment Reminder"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                data-testid="input-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="header">Header</Label>
              <Input
                id="header"
                placeholder="Optional header"
                value={formData.header}
                onChange={(e) => setFormData({ ...formData, header: e.target.value })}
                data-testid="input-header"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Body *</Label>
              <Textarea
                id="body"
                placeholder="Message body"
                rows={6}
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                data-testid="input-body"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer">Footer</Label>
              <Input
                id="footer"
                placeholder="Optional footer"
                value={formData.footer}
                onChange={(e) => setFormData({ ...formData, footer: e.target.value })}
                data-testid="input-footer"
              />
            </div>
            <div className="space-y-2">
              <Label>Buttons (up to 3)</Label>
              <div className="space-y-2">
                {formData.buttons.map((button, index) => (
                  <Input
                    key={index}
                    placeholder={`Button ${index + 1}`}
                    value={button}
                    onChange={(e) => {
                      const newButtons = [...formData.buttons];
                      newButtons[index] = e.target.value;
                      setFormData({ ...formData, buttons: newButtons });
                    }}
                    data-testid={`input-button-${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.title || !formData.body || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-template"
            >
              {editingTemplate ? "Update" : "Create"} Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
