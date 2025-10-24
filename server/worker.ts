import cron from "node-cron";
import { storage } from "./storage";
import { logoutChannel } from "./whapi";

// Background worker for automated tasks
export class BackgroundWorker {
  private dailyBalanceJob: ReturnType<typeof cron.schedule> | null = null;
  private messageProcessorJob: ReturnType<typeof cron.schedule> | null = null;

  start() {
    // Channel expiration check - runs every hour to catch expirations quickly
    this.dailyBalanceJob = cron.schedule("0 * * * *", async () => {
      await this.deductDailyBalance();
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
              userId: user.id,
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
}

// Create singleton instance
export const backgroundWorker = new BackgroundWorker();
