import cron from "node-cron";
import { storage } from "./storage";
import { logoutChannel, extendWhapiChannel, sendTextMessage } from "./whapi";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// App timezone - used for booking reminders
const APP_TIMEZONE = "Asia/Bahrain";

// Background worker for automated tasks
export class BackgroundWorker {
  private dailyBalanceJob: ReturnType<typeof cron.schedule> | null = null;
  private messageProcessorJob: ReturnType<typeof cron.schedule> | null = null;
  private mediaCleanupJob: ReturnType<typeof cron.schedule> | null = null;
  private autoExtendJob: ReturnType<typeof cron.schedule> | null = null;
  private appointmentReminderJob: ReturnType<typeof cron.schedule> | null = null;

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

    // Appointment reminders - runs every 15 minutes to check for upcoming appointments
    this.appointmentReminderJob = cron.schedule("*/15 * * * *", async () => {
      await this.sendAppointmentReminders();
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
    if (this.appointmentReminderJob) {
      this.appointmentReminderJob.stop();
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
          let userExtendedCount = 0;
          let userFailedCount = 0;
          const failedChannels: { id: number; label: string; error: string }[] = [];
          
          for (const channel of extendableChannels) {
            try {
              // Check if channel has WHAPI channel ID for API call
              if (!channel.whapiChannelId) {
                console.log(`[AutoExtend] Channel "${channel.label}" (ID: ${channel.id}) has no WHAPI channel ID, skipping`);
                userFailedCount++;
                errorCount++;
                failedChannels.push({
                  id: channel.id,
                  label: channel.label,
                  error: "No WHAPI channel ID configured",
                });
                continue;
              }
              
              // Deduct from main balance first
              await storage.updateMainDaysBalance(-1);
              
              // Call WHAPI API to extend the channel on their platform
              try {
                await extendWhapiChannel(channel.whapiChannelId, 1, "Auto-extend daily");
                console.log(`[AutoExtend] WHAPI API call successful for channel "${channel.label}"`);
              } catch (whapiError) {
                console.error(`[AutoExtend] WHAPI API failed for channel ${channel.id}:`, whapiError);
                // Refund main balance since WHAPI call failed
                await storage.updateMainDaysBalance(1);
                throw whapiError;
              }
              
              // Update local database after successful WHAPI call
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
              userExtendedCount++;
              extendedCount++;
            } catch (channelError) {
              console.error(`[AutoExtend] Failed to extend channel ${channel.id}:`, channelError);
              
              userFailedCount++;
              errorCount++;
              failedChannels.push({
                id: channel.id,
                label: channel.label,
                error: channelError instanceof Error ? channelError.message : String(channelError),
              });
            }
          }
          
          // Create appropriate audit log based on results
          if (userFailedCount > 0 && userExtendedCount === 0) {
            // All channels failed
            await storage.createAuditLog({
              actorUserId: subscription.userId,
              action: "AUTO_EXTEND_FAILED",
              meta: {
                reason: "All channel extensions failed",
                channelsAttempted: extendableChannels.length,
                failedChannels,
                date: now.toISOString(),
              },
            });
          } else if (userFailedCount > 0 && userExtendedCount > 0) {
            // Partial success
            await storage.createAuditLog({
              actorUserId: subscription.userId,
              action: "AUTO_EXTEND_PARTIAL",
              meta: {
                channelsExtended: userExtendedCount,
                channelsFailed: userFailedCount,
                failedChannels,
                date: now.toISOString(),
              },
            });
          } else if (userExtendedCount > 0) {
            // All channels succeeded
            await storage.createAuditLog({
              actorUserId: subscription.userId,
              action: "AUTO_EXTEND_SUCCESS",
              meta: {
                channelsExtended: userExtendedCount,
                date: now.toISOString(),
              },
            });
          }
          
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

  // Send appointment reminders for upcoming bookings
  private async sendAppointmentReminders() {
    try {
      // Get all confirmed bookings with reminders enabled and not yet sent
      const bookingsNeedingReminders = await storage.getBookingsNeedingReminders();
      
      if (bookingsNeedingReminders.length === 0) {
        return; // Silent return when no reminders pending
      }
      
      let sentCount = 0;
      let errorCount = 0;
      const nowInTz = dayjs().tz(APP_TIMEZONE);
      
      for (const booking of bookingsNeedingReminders) {
        try {
          // Parse appointment date and time in the app's timezone
          const appointmentDateTimeStr = `${booking.slotDate} ${booking.startTime}`;
          const appointmentTime = dayjs.tz(appointmentDateTimeStr, "YYYY-MM-DD HH:mm", APP_TIMEZONE);
          
          // Calculate when reminder should be sent (hours before appointment)
          const reminderHours = booking.reminderHoursBefore || 24;
          const reminderTime = appointmentTime.subtract(reminderHours, 'hour');
          
          // Check if it's time to send the reminder (within 15 minute window after reminder time)
          // This prevents sending too early or re-sending on every cron run
          const fifteenMinutes = 15;
          if (nowInTz.isAfter(reminderTime) && nowInTz.isBefore(reminderTime.add(fifteenMinutes, 'minute'))) {
            // Time to send reminder - get user's active channel
            const channels = await storage.getChannelsForUser(booking.userId);
            const activeChannel = channels.find(ch => ch.status === "ACTIVE" && ch.whapiChannelToken);
            
            if (!activeChannel) {
              console.log(`[Reminder] No active channel for user ${booking.userId}, skipping booking ${booking.id}`);
              continue;
            }
            
            // Get staff and department for message placeholders
            const staff = await storage.getBookingStaff(booking.staffId);
            const dept = await storage.getBookingDepartment(booking.departmentId);
            
            // Build reminder message with placeholders
            let reminderMessage = booking.reminderMessage || 
              'Reminder: You have an appointment on {{date}} at {{time}} with {{staff}} in {{department}}.';
            
            reminderMessage = reminderMessage
              .replace(/\{\{date\}\}/g, booking.slotDate)
              .replace(/\{\{time\}\}/g, booking.startTime)
              .replace(/\{\{department\}\}/g, dept?.name || '')
              .replace(/\{\{staff\}\}/g, staff?.name || '')
              .replace(/\{\{name\}\}/g, booking.customerName || '');
            
            // Send the reminder via WHAPI
            await sendTextMessage(activeChannel.whapiChannelToken!, {
              to: booking.customerPhone,
              body: reminderMessage,
            });
            
            // Mark reminder as sent
            await storage.markBookingReminderSent(booking.id);
            
            console.log(`[Reminder] Sent reminder for booking ${booking.id} to ${booking.customerPhone}`);
            sentCount++;
          }
        } catch (bookingError) {
          console.error(`[Reminder] Error processing booking ${booking.id}:`, bookingError);
          errorCount++;
        }
      }
      
      // Only log summary when there's activity
      if (sentCount > 0 || errorCount > 0) {
        console.log(`[Reminder] Sent: ${sentCount}, Errors: ${errorCount}`);
      }
    } catch (error) {
      console.error("[Reminder] Error in appointment reminder job:", error);
    }
  }
}

// Create singleton instance
export const backgroundWorker = new BackgroundWorker();
