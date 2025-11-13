import { FileText, Phone, Globe, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface WhatsAppPreviewProps {
  header?: string;
  body?: string;
  footer?: string;
  messageType: string;
  mediaUrl?: string;
  buttons: Array<{
    text: string;
    type: string;
    value?: string;
  }>;
  uploadingFile?: boolean;
}

export function WhatsAppPreview({
  header,
  body,
  footer,
  messageType,
  mediaUrl,
  buttons,
  uploadingFile,
}: WhatsAppPreviewProps) {
  const hasMedia = ["image", "image_buttons", "video_buttons", "document"].includes(messageType);
  const isVideo = messageType.includes("video");
  const isImage = messageType.includes("image");
  const isDocument = messageType === "document";

  return (
    <div className="flex items-center justify-center">
      {/* Phone Mockup */}
      <div className="relative w-full max-w-sm">
        {/* Phone Frame */}
        <div className="relative rounded-[2.5rem] border-[14px] border-gray-800 dark:border-gray-700 bg-gray-800 shadow-2xl overflow-hidden">
          {/* Phone Notch */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-40 h-6 bg-gray-800 dark:bg-gray-700 rounded-b-3xl z-10"></div>
          
          {/* Phone Screen */}
          <div className="bg-[#E5DDD5] dark:bg-[#0D1418] min-h-[500px] max-h-[1000px] overflow-hidden flex flex-col">
            {/* WhatsApp Header */}
            <div className="bg-[#075E54] dark:bg-[#1F2C34] px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-gray-300 dark:bg-gray-600">
                  <User className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="text-white font-medium text-sm">Preview</div>
                <div className="text-white/70 text-xs">online</div>
              </div>
            </div>

            {/* Chat Background Pattern */}
            <div 
              className="flex-1 px-3 py-4 overflow-y-auto"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d1d7db' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            >
              {/* Message Bubble */}
              <div className="flex justify-end mb-2">
                <div className="max-w-[85%]">
                  {/* Message Container */}
                  <div className="bg-[#DCF8C6] dark:bg-[#005C4B] rounded-lg shadow-sm overflow-hidden">
                    {/* Media Section */}
                    {hasMedia && (
                      <div className="relative">
                        {uploadingFile ? (
                          <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <div className="text-gray-500 text-sm">Uploading...</div>
                          </div>
                        ) : mediaUrl ? (
                          <>
                            {isImage && (
                              <img 
                                src={mediaUrl} 
                                alt="Preview" 
                                className="w-full max-h-64 object-cover"
                              />
                            )}
                            {isVideo && (
                              <video 
                                src={mediaUrl} 
                                className="w-full max-h-64 object-cover"
                                controls
                              />
                            )}
                            {isDocument && (
                              <div className="p-3 flex items-center gap-3 bg-white/20 dark:bg-black/20">
                                <div className="w-12 h-12 rounded-full bg-white/30 dark:bg-white/10 flex items-center justify-center">
                                  <FileText className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">Document</div>
                                  <div className="text-xs opacity-70">PDF, DOC, etc.</div>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <div className="text-gray-500 text-sm">No media uploaded</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Text Content */}
                    <div className="px-3 py-2">
                      {header && (
                        <div className="font-semibold mb-1 text-sm text-gray-900 dark:text-gray-100">
                          {header}
                        </div>
                      )}
                      
                      <div className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 break-words">
                        {body || "Your message will appear here..."}
                      </div>
                      
                      {footer && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {footer}
                        </div>
                      )}
                      
                      {/* Timestamp */}
                      <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-1 text-right">
                        {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Buttons Section - Only show for message types that support buttons */}
                    {buttons.length > 0 && !["image", "document"].includes(messageType) && (
                      <div className="border-t border-gray-300 dark:border-gray-600">
                        {buttons.map((button, index) => (
                          <button
                            key={index}
                            className="w-full px-4 py-2.5 text-sm font-medium text-[#027EB5] dark:text-[#53BDEB] hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-2 border-b border-gray-300 dark:border-gray-600 last:border-b-0 transition-colors"
                            data-testid={`preview-button-${index + 1}`}
                          >
                            {button.type === "url" && <Globe className="w-4 h-4" />}
                            {button.type === "call" && <Phone className="w-4 h-4" />}
                            <span>{button.text}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
