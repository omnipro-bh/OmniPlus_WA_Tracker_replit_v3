import cron from "node-cron";
import { storage } from "./storage";
import { logoutChannel } from "./whapi";
import fs from "fs";
import path from "path";

// Background worker for automated tasks
export class BackgroundWorker {
  private dailyBalanceJob: ReturnType<typeof cron.schedule> | null = null;
  private messageProcessorJob: ReturnType<typeof cron.schedule> | null = null;
  private mediaCleanupJob: ReturnType<typeof cron.schedule> | null = null;
  private autoExtendJob: ReturnType<typeof cron.schedule> | null = null;

  start() {
    // Channel expiration check - runs every hour to catch expirations quickly
    this.dailyBalanceJob = cron.schedule("0 * * * *", async () => {
      await this.deductDailyBalance();
    });

    // Media cleanup - runs daily at 3 AM to delete files older than 30 days
    this.mediaCleanupJob = cron.schedule("0 3 * * *", async () => {
      await this.cleanupOldMedia();
    });

    // Auto-extend channels - runs daily at midnight (00:00)
    this.autoExtendJob = cron.schedule("0 0 * * *", async () => {
      await this.autoExtendChannels();
    });

    // Message queue processor - disabled for now
    // this.messageProcessorJob = cron.schedule("*/30 * * * * *", async () => {
    //   await this.processMessageQueue();
    // });
  }

  stop() {
    if (this.dailyBalanceJob) {
      this.dailyBalanceJob.stop();
    }
    if (this.messageProcessorJob) {
      this.messageProcessorJob.stop();
    }
    if (this.mediaCleanupJob) {
      this.mediaCleanupJob.stop();
    }
    if (this.autoExtendJob) {
      this.autoExtendJob.stop();
    }
  }

  // Check and pause expired channels
  private async deductDailyBalance() {
    try {
      // Get all users to check their channels
      const users = await storage.getAllUsers();
      const now = new Date();
      let expiredCount = 0;

      for (const user of users) {
        // Get all channels for this user
        const channels = await storage.getChannelsForUser(user.id);
        
        for (const channel of channels) {
          // Skip non-active channels
          if (channel.status !== "ACTIVE") continue;

          // Check if channel has expired
          if (channel.expiresAt && new Date(channel.expiresAt) <= now) {
            // First, try to logout from WhatsApp via WHAPI
            if (channel.whapiChannelToken) {
              try {
                await logoutChannel(channel.whapiChannelToken);
                console.log(`Logged out expired channel: ${channel.label}`);
              } catch (error) {
                console.error(`Failed to logout channel ${channel.label}:`, error);
                // Continue even if logout fails - channel might already be disconnected
              }
            }

            // Update channel to PAUSED status and clear authorization
            await storage.updateChannel(channel.id, {
              status: "PAUSED",
              daysRemaining: 0,
              whapiStatus: "stopped", // Mark as stopped
            });

            expiredCount++;

            // Log audit trail
            await storage.createAuditLog({
              actorUserId: user.id,
              action: "CHANNEL_EXPIRED",
              meta: {
                channelId: channel.id,
                channelLabel: channel.label,
                expiresAt: channel.expiresAt,
                phone: channel.phone,
              },
            });
          } else if (channel.expiresAt) {
            // Channel still active - recalculate days remaining
            const daysRemaining = Math.max(
              0,
              Math.ceil((new Date(channel.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            );
            
            // Update days remaining
            await storage.updateChannel(channel.id, {
              daysRemaining,
            });
          }
        }

        // Check if user should be marked as expired (all channels paused/pending)
        const updatedChannels = await storage.getChannelsForUser(user.id);
        const hasActiveChannels = updatedChannels.some(c => c.status === "ACTIVE");
        
        if (!hasActiveChannels && user.status === "active") {
          await storage.updateUser(user.id, {
            status: "expired",
          });
        }
      }

      console.log(`Daily channel expiration check completed. Expired ${expiredCount} channels.`);
    } catch (error) {
      console.error("Error in daily channel expiration check:", error);
    }
  }

  // Process queued messages and update statuses
  private async processMessageQueue() {
    try {
      // Get all jobs with queued messages
      // const jobs = await storage.getAllJobs(); // Method not implemented
      const jobs: any[] = [];
      
      for (const job of jobs) {
        // Skip completed or failed jobs
        if (job.status === "DELIVERED" || job.status === "FAILED") continue;

        // Get messages for this job
        const messages = await storage.getMessagesForJob(job.id);
        
        // Count statuses
        let queued = 0;
        let pending = 0;
        let sent = 0;
        let delivered = 0;
        let read = 0;
        let failed = 0;
        let replied = 0;

        for (const message of messages) {
          switch (message.status) {
            case "QUEUED": queued++; break;
            case "PENDING": pending++; break;
            case "SENT": sent++; break;
            case "DELIVERED": delivered++; break;
            case "READ": read++; break;
            case "FAILED": failed++; break;
            case "REPLIED": replied++; break;
          }

          // Simulate message processing (in real app, this would call WHAPI)
          if (message.status === "QUEUED") {
            // Move to PENDING
            await storage.updateMessage(message.id, {
              status: "PENDING",
            });
            queued--;
            pending++;
          } else if (message.status === "PENDING") {
            // Simulate sending (in real app, call WHAPI API here)
            // For now, just mark as SENT
            await storage.updateMessage(message.id, {
              status: "SENT",
            });
            pending--;
            sent++;
          }
        }

        // Update job statistics
        await storage.updateJob(job.id, {
          queued,
          pending,
          sent,
          delivered,
          read,
          failed,
          replied,
          status: this.calculateJobStatus(queued, pending, sent, delivered, failed, job.total),
        });
      }
    } catch (error) {
      // Error in message queue processor
    }
  }

  // Calculate overall job status based on message statuses
  private calculateJobStatus(
    queued: number,
    pending: number,
    sent: number,
    delivered: number,
    failed: number,
    total: number
  ): "QUEUED" | "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "PARTIAL" {
    if (failed === total) return "FAILED";
    if (failed > 0 && (delivered + failed) === total) return "PARTIAL";
    if (delivered === total) return "DELIVERED";
    if (sent > 0 || delivered > 0) return "SENT";
    if (pending > 0) return "PENDING";
    return "QUEUED";
  }

  // Clean up uploaded media files older than 30 days
  private async cleanupOldMedia() {
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      
      // Skip if directory doesn't exist
      if (!fs.existsSync(uploadsDir)) {
        return;
      }

      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      // Read all files in uploads directory
      const files = fs.readdirSync(uploadsDir);

      for (const file of files) {
        // Skip .gitkeep
        if (file === '.gitkeep') continue;

        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);

        // Check if file is older than 30 days
        if (stats.mtimeMs < thirtyDaysAgo) {
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`Deleted old media file: ${file}`);
          } catch (error) {
            console.error(`Failed to delete ${file}:`, error);
          }
        }
      }

      console.log(`Media cleanup completed. Deleted ${deletedCount} files older than 30 days.`);
    } catch (error) {
      console.error("Error in media cleanup:", error);
    }
  }

  // Auto-extend channels for users with autoExtendEnabled
  private async autoExtendChannels() {
    try {
      console.log("[AutoExtend] Starting daily auto-extend check...");
      
      // Get the current day of week (0 = Sunday, 5 = Friday, 6 = Saturday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const isFriday = dayOfWeek === 5;
      const isSaturday = dayOfWeek === 6;
      
      // Get all active subscriptions with auto-extend enabled
      const subscriptions = await storage.getSubscriptionsWithAutoExtend();
      console.log(`[AutoExtend] Found ${subscriptions.length} subscriptions with auto-extend enabled`);
      
      let extendedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      
      for (const subscription of subscriptions) {
        try {
          // Check if should skip based on day of week
          if (isFriday && subscription.skipFriday) {
            console.log(`[AutoExtend] Skipping user ${subscription.userId} - Friday skip enabled`);
            skippedCount++;
            continue;
          }
          if (isSaturday && subscription.skipSaturday) {
            console.log(`[AutoExtend] Skipping user ${subscription.userId} - Saturday skip enabled`);
            skippedCount++;
            continue;
          }
          
          // Get user's channels
          const channels = await storage.getChannelsForUser(subscription.userId);
          
          // Filter to only active or paused channels that can be extended
          const extendableChannels = channels.filter(ch => 
            ch.status === "ACTIVE" || ch.status === "PAUSED"
          );
          
          if (extendableChannels.length === 0) {
            console.log(`[AutoExtend] No extendable channels for user ${subscription.userId}`);
            continue;
          }
          
          // Check main balance
          const mainBalance = await storage.getMainDaysBalance();
          if (mainBalance < extendableChannels.length) {
            console.log(`[AutoExtend] Insufficient main balance (${mainBalance}) for user ${subscription.userId} with ${extendableChannels.length} channels`);
            
            // Create audit log for insufficient balance
            await storage.createAuditLog({
              actorUserId: subscription.userId,
              action: "AUTO_EXTEND_FAILED",
              meta: {
                reason: "Insufficient main balance",
                mainBalance,
                channelsToExtend: extendableChannels.length,
              },
            });
            
            errorCount++;
            continue;
          }
          
          // Extend each channel by 1 day
          for (const channel of extendableChannels) {
            try {
              // Deduct from main balance
              await storage.updateMainDaysBalance(-1);
              
              // Add 1 day to channel
              await storage.addDaysToChannel({
                channelId: channel.id,
                days: 1,
                source: "ADMIN_MANUAL",
                metadata: {
                  reason: "auto_extend",
                  subscriptionId: subscription.id,
                  date: now.toISOString(),
                },
              });
              
              // Create balance transaction
              await storage.createBalanceTransaction({
                type: "allocate",
                days: 1,
                channelId: channel.id,
                userId: subscription.userId,
                note: `Auto-extend: 1 day added to channel "${channel.label}"`,
              });
              
              console.log(`[AutoExtend] Extended channel "${channel.label}" (ID: ${channel.id}) for user ${subscription.userId}`);
              extendedCount++;
            } catch (channelError) {
              console.error(`[AutoExtend] Failed to extend channel ${channel.id}:`, channelError);
              
              // Refund the main balance if channel extension failed after deduction
              try {
                await storage.updateMainDaysBalance(1);
              } catch (refundError) {
                console.error(`[AutoExtend] Failed to refund main balance:`, refundError);
              }
              
              errorCount++;
            }
          }
          
          // Create audit log for successful auto-extend
          await storage.createAuditLog({
            actorUserId: subscription.userId,
            action: "AUTO_EXTEND_SUCCESS",
            meta: {
              channelsExtended: extendableChannels.length,
              date: now.toISOString(),
            },
          });
          
        } catch (subscriptionError) {
          console.error(`[AutoExtend] Error processing subscription ${subscription.id}:`, subscriptionError);
          errorCount++;
        }
      }
      
      console.log(`[AutoExtend] Completed. Extended: ${extendedCount} channels, Skipped: ${skippedCount} users, Errors: ${errorCount}`);
    } catch (error) {
      console.error("[AutoExtend] Error in auto-extend job:", error);
    }
  }
}

// Create singleton instance
export const backgroundWorker = new BackgroundWorker();
