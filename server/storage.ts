import { db } from "./db";
import { eq, and, or, asc, desc, sql, like, inArray, gt } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  User,
  InsertUser,
  Plan,
  InsertPlan,
  Subscription,
  InsertSubscription,
  Channel,
  InsertChannel,
  Template,
  InsertTemplate,
  Job,
  InsertJob,
  Message,
  InsertMessage,
  Workflow,
  InsertWorkflow,
  OfflinePayment,
  InsertOfflinePayment,
  AuditLog,
  InsertAuditLog,
  Setting,
  InsertSetting,
  ChannelDaysLedger,
  InsertChannelDaysLedger,
  Coupon,
  InsertCoupon,
} from "@shared/schema";

// Calendar view types (enriched slot + booking shapes returned by the calendar endpoint)
export interface CalendarSlot {
  id: number;
  staffId: number;
  staffName: string;
  departmentId: number;
  departmentName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  capacity: number;
}

export interface CalendarBooking {
  id: number;
  slotDate: string;
  endDate: string | null;
  startTime: string;
  endTime: string;
  endDayStartTime: string | null;
  endDayEndTime: string | null;
  departmentId: number;
  departmentName: string;
  staffId: number;
  staffName: string;
  customerName: string | null;
  customerPhone: string;
  status: string;
  bookingLabel: string | null;
  customField1Label: string | null;
  customField1Value: string | null;
  customField2Label: string | null;
  customField2Value: string | null;
}

// Booking statuses that occupy a slot for calendar availability purposes
export const BLOCKING_BOOKING_STATUSES = ['confirmed', 'completed'] as const;

// Sentinel error thrown by createManualBookingWithValues when the slot is taken.
export class BookingSlotUnavailableError extends Error {
  constructor() {
    super("Booking slot unavailable");
    this.name = "BookingSlotUnavailableError";
  }
}

// Private helper: enumerate each "YYYY-MM-DD" date in [from, to] inclusive
// (UTC, DST-safe). Mirrors the equivalent helper in routes.ts but kept local to
// avoid a storage -> routes import.
function eachDateInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

// Private predicate: does an existing booking's inclusive day span
// [slotDate, COALESCE(endDate, slotDate)] intersect the requested [fromDate, toDate]?
// Single-day bookings (endDate = NULL) behave as endDate === slotDate.
function bookingDaySpanOverlaps(fromDate: string, toDate: string) {
  return sql`${schema.bookings.slotDate} <= ${toDate}
    AND COALESCE(${schema.bookings.endDate}, ${schema.bookings.slotDate}) >= ${fromDate}`;
}

// Shape needed to resolve a booking's occupied time window for a given date.
export interface OccupiedWindowSource {
  slotDate: string;
  endDate: string | null;
  startTime: string;
  endTime: string;
  endDayStartTime: string | null;
  endDayEndTime: string | null;
}

// Resolve the [start, end] window a booking occupies on a specific date.
// The last day of a multi-day booking may use its own window (endDayStartTime/
// endDayEndTime); every other day (and single-day bookings) uses startTime/endTime.
export function occupiedWindowForDate(b: OccupiedWindowSource, date: string): [string, string] {
  const isLastDay = b.endDate != null && b.endDate !== b.slotDate && date === b.endDate;
  if (isLastDay) return [b.endDayStartTime ?? b.startTime, b.endDayEndTime ?? b.endTime];
  return [b.startTime, b.endTime];
}

// Count distinct existing bookings that time-overlap the proposed booking on any
// day of the proposed range. String comparison works because times are "HH:MM".
function countConflicts(proposed: OccupiedWindowSource, existing: OccupiedWindowSource[]): number {
  const days = eachDateInRange(proposed.slotDate, proposed.endDate ?? proposed.slotDate);
  let n = 0;
  for (const ex of existing) {
    const exEnd = ex.endDate ?? ex.slotDate;
    let conflict = false;
    for (const d of days) {
      if (d < ex.slotDate || d > exEnd) continue;
      const [ps, pe] = occupiedWindowForDate(proposed, d);
      const [es, ee] = occupiedWindowForDate(ex, d);
      if (es < pe && ee > ps) { conflict = true; break; }
    }
    if (conflict) n++;
  }
  return n;
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Omit<InsertUser, "passwordHash"> & { passwordHash: string }): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  getAllUsers(): Promise<User[]>;

  // Plans
  getPlans(): Promise<Plan[]>;
  getPlan(id: number): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: number, data: Partial<Plan>): Promise<Plan | undefined>;
  deletePlan(id: number): Promise<void>;

  // Coupons
  getCoupons(): Promise<Coupon[]>;
  getCoupon(id: number): Promise<Coupon | undefined>;
  getCouponByCode(code: string): Promise<Coupon | undefined>;
  createCoupon(coupon: InsertCoupon): Promise<Coupon>;
  updateCoupon(id: number, data: Partial<Coupon>): Promise<Coupon | undefined>;
  deleteCoupon(id: number): Promise<void>;
  validateCoupon(code: string, userId: number, planId: number): Promise<{ valid: boolean; message: string; coupon?: Coupon }>;
  incrementCouponUsage(id: number): Promise<void>;

  // Subscriptions
  getActiveSubscriptionForUser(userId: number): Promise<Subscription | undefined>;
  getSubscriptionsWithAutoExtend(): Promise<Subscription[]>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription | undefined>;

  // Channels
  getChannelsForUser(userId: number): Promise<Channel[]>;
  getChannel(id: number): Promise<Channel | undefined>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  updateChannel(id: number, data: Partial<Channel>): Promise<Channel | undefined>;
  deleteChannel(id: number): Promise<void>;

  // Templates
  getTemplatesForUser(userId: number): Promise<Template[]>;
  getTemplate(id: number): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: number, data: Partial<Template>): Promise<Template | undefined>;
  deleteTemplate(id: number): Promise<void>;

  // Jobs
  getJobsForUser(userId: number): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: number, data: Partial<Job>): Promise<Job | undefined>;

  // Messages
  getMessagesForJob(jobId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: number, data: Partial<Message>): Promise<Message | undefined>;

  // Workflows
  getWorkflowsForUser(userId: number): Promise<Workflow[]>;
  getWorkflow(id: number): Promise<Workflow | undefined>;
  createWorkflow(workflow: InsertWorkflow): Promise<Workflow>;
  updateWorkflow(id: number, data: Partial<Workflow>): Promise<Workflow | undefined>;
  deleteWorkflow(id: number): Promise<void>;

  // Leads
  insertLead(lead: schema.InsertLead): Promise<schema.Lead>;

  // Offline Payments
  getOfflinePayments(status?: string): Promise<OfflinePayment[]>;
  getOfflinePayment(id: number): Promise<OfflinePayment | undefined>;
  createOfflinePayment(payment: InsertOfflinePayment): Promise<OfflinePayment>;
  updateOfflinePayment(id: number, data: Partial<OfflinePayment>): Promise<OfflinePayment | undefined>;
  deleteOfflinePayment(id: number): Promise<void>;

  // Plan Requests
  getPlanRequests(status?: string): Promise<schema.PlanRequest[]>;
  getPlanRequest(id: number): Promise<schema.PlanRequest | undefined>;
  createPlanRequest(request: schema.InsertPlanRequest): Promise<schema.PlanRequest>;
  updatePlanRequest(id: number, data: Partial<schema.PlanRequest>): Promise<schema.PlanRequest | undefined>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string | null): Promise<Setting>;
  getSettingsByPrefix(prefix: string): Promise<Setting[]>;
  
  // Balance Transactions
  createBalanceTransaction(transaction: Omit<schema.InsertBalanceTransaction, "createdAt">): Promise<schema.BalanceTransaction>;
  getBalanceTransactions(limit?: number): Promise<schema.BalanceTransaction[]>;
  getBalanceTransaction(id: number): Promise<schema.BalanceTransaction | null>;
  deleteBalanceTransaction(id: number): Promise<void>;
  getMainDaysBalance(): Promise<number>;
  updateMainDaysBalance(change: number): Promise<number>;

  // Channel Days Ledger
  addDaysToChannel(params: {
    channelId: number;
    days: number;
    source: "ADMIN_MANUAL" | "PAYPAL" | "OFFLINE" | "MIGRATION";
    balanceTransactionId?: number;
    subscriptionId?: number;
    offlinePaymentId?: number;
    metadata?: any;
  }): Promise<{ ledgerEntry: ChannelDaysLedger; updatedChannel: Channel }>;
  getChannelDaysLedger(channelId: number): Promise<ChannelDaysLedger[]>;
  calculateChannelDaysRemaining(channelId: number): Promise<number>;

  // Bulk Logs
  createBulkLog(log: schema.InsertBulkLog): Promise<schema.BulkLog>;
  getBulkLogs(filters?: {
    userId?: number;
    jobId?: number;
    level?: string;
    category?: string;
    limit?: number;
  }): Promise<schema.BulkLog[]>;

  // Terms & Conditions
  getActiveTermsDocuments(): Promise<schema.TermsDocument[]>;
  getTermsDocument(id: number): Promise<schema.TermsDocument | undefined>;
  getTermsDocumentByType(type: string): Promise<schema.TermsDocument | undefined>;
  createTermsDocument(document: schema.InsertTermsDocument): Promise<schema.TermsDocument>;
  updateTermsDocument(id: number, data: Partial<schema.TermsDocument>): Promise<schema.TermsDocument | undefined>;
  setActiveTermsDocument(id: number): Promise<schema.TermsDocument | undefined>;

  // Webhook Events (for idempotency)
  getWebhookEvent(provider: string, eventId: string): Promise<schema.WebhookEvent | undefined>;
  createWebhookEvent(event: schema.InsertWebhookEvent): Promise<schema.WebhookEvent>;
  markWebhookProcessed(id: number, error?: string): Promise<schema.WebhookEvent | undefined>;

  // Ledger
  createLedgerEntry(entry: schema.InsertLedger): Promise<schema.Ledger>;
  getLedgerEntries(userId?: number, limit?: number): Promise<schema.Ledger[]>;

  // Phonebooks
  getPhonebooksForUser(userId: number): Promise<schema.Phonebook[]>;
  getPhonebook(id: number): Promise<schema.Phonebook | undefined>;
  createPhonebook(phonebook: schema.InsertPhonebook): Promise<schema.Phonebook>;
  updatePhonebook(id: number, data: Partial<schema.Phonebook>): Promise<schema.Phonebook | undefined>;
  deletePhonebook(id: number): Promise<void>;

  // Phonebook Contacts
  getContactsForPhonebook(phonebookId: number): Promise<schema.PhonebookContact[]>;
  getContact(id: number): Promise<schema.PhonebookContact | undefined>;
  createContact(contact: schema.InsertPhonebookContact): Promise<schema.PhonebookContact>;
  createContactsBatch(contacts: schema.InsertPhonebookContact[]): Promise<number>; // Batch insert for CSV import
  updateContact(id: number, data: Partial<schema.PhonebookContact>): Promise<schema.PhonebookContact | undefined>;
  deleteContact(id: number): Promise<void>;

  // Media Uploads
  createMediaUpload(upload: schema.InsertMediaUpload): Promise<schema.MediaUpload>;
  getMediaUploadsForUser(userId: number, limit?: number): Promise<schema.MediaUpload[]>;
  getMediaUpload(id: number): Promise<schema.MediaUpload | undefined>;

  // Subscribers
  getSubscribersForUser(
    userId: number, 
    filters?: { 
      status?: 'subscribed' | 'unsubscribed'; 
      page?: number; 
      pageSize?: number; 
    }
  ): Promise<{ subscribers: schema.Subscriber[]; total: number }>;
  getSubscriber(id: number): Promise<schema.Subscriber | undefined>;
  upsertSubscriber(data: { userId: number; phone: string; name?: string; status: 'subscribed' | 'unsubscribed' }): Promise<schema.Subscriber>;
  updateSubscriber(id: number, data: Partial<schema.Subscriber>): Promise<schema.Subscriber | undefined>;
  deleteSubscriber(id: number): Promise<void>;

  // Capture Sequences
  getCaptureSequencesForUser(userId: number): Promise<schema.CaptureSequence[]>;
  getCaptureSequencesForWorkflow(workflowId: number): Promise<schema.CaptureSequence[]>;
  getCaptureSequence(id: number): Promise<schema.CaptureSequence | undefined>;
  getCaptureSequenceByNodeId(workflowId: number, nodeId: string): Promise<schema.CaptureSequence | undefined>;
  createCaptureSequence(sequence: schema.InsertCaptureSequence): Promise<schema.CaptureSequence>;
  updateCaptureSequence(id: number, data: Partial<schema.CaptureSequence>): Promise<schema.CaptureSequence | undefined>;
  deleteCaptureSequence(id: number): Promise<void>;
  countCaptureSequencesForUser(userId: number): Promise<number>;

  // Captured Data
  getCapturedDataForSequence(sequenceId: number, page?: number, pageSize?: number): Promise<{ entries: schema.CapturedData[]; total: number }>;
  getCapturedDataForUser(userId: number, filters?: { workflowId?: number; page?: number; pageSize?: number }): Promise<{ entries: schema.CapturedData[]; total: number }>;
  getCapturedDataEntry(id: number): Promise<schema.CapturedData | undefined>;
  createCapturedData(data: schema.InsertCapturedData): Promise<schema.CapturedData>;
  deleteCapturedData(id: number): Promise<void>;
  countCapturedDataForSequence(sequenceId: number): Promise<number>;

  // Booking Scheduler - Services (groups departments)
  getBookingServicesForUser(userId: number): Promise<schema.BookingService[]>;
  getBookingService(id: number): Promise<schema.BookingService | undefined>;
  createBookingService(service: schema.InsertBookingService): Promise<schema.BookingService>;
  updateBookingService(id: number, data: Partial<schema.BookingService>): Promise<schema.BookingService | undefined>;
  deleteBookingService(id: number): Promise<void>;

  // Booking Scheduler - Departments
  getBookingDepartmentsForUser(userId: number): Promise<schema.BookingDepartment[]>;
  getBookingDepartmentsForService(serviceId: number): Promise<schema.BookingDepartment[]>;
  getBookingDepartment(id: number): Promise<schema.BookingDepartment | undefined>;
  createBookingDepartment(dept: schema.InsertBookingDepartment): Promise<schema.BookingDepartment>;
  updateBookingDepartment(id: number, data: Partial<schema.BookingDepartment>): Promise<schema.BookingDepartment | undefined>;
  deleteBookingDepartment(id: number): Promise<void>;

  // Booking Scheduler - Staff
  getBookingStaffForDepartment(departmentId: number): Promise<schema.BookingStaff[]>;
  getBookingStaffForUser(userId: number): Promise<schema.BookingStaff[]>;
  getBookingStaff(id: number): Promise<schema.BookingStaff | undefined>;
  createBookingStaff(staff: schema.InsertBookingStaff): Promise<schema.BookingStaff>;
  updateBookingStaff(id: number, data: Partial<schema.BookingStaff>): Promise<schema.BookingStaff | undefined>;
  deleteBookingStaff(id: number): Promise<void>;

  // Booking Scheduler - Slots
  getBookingStaffSlots(staffId: number): Promise<schema.BookingStaffSlot[]>;
  getBookingStaffSlot(id: number): Promise<schema.BookingStaffSlot | undefined>;
  createBookingStaffSlot(slot: schema.InsertBookingStaffSlot): Promise<schema.BookingStaffSlot>;
  updateBookingStaffSlot(id: number, data: Partial<schema.BookingStaffSlot>): Promise<schema.BookingStaffSlot | undefined>;
  deleteBookingStaffSlot(id: number): Promise<void>;
  getBookingStaffSlotsForUser(userId: number, filters?: { departmentId?: number; staffId?: number }): Promise<CalendarSlot[]>;

  // Booking Scheduler - Bookings (optimized for fast chatbot response)
  getBookingsForUser(userId: number, filters?: { 
    status?: string; 
    fromDate?: string; 
    toDate?: string; 
    staffId?: number;
    departmentId?: number;
    page?: number; 
    pageSize?: number;
    search?: string;
    outdatedConfirmed?: boolean; // Special filter for confirmed bookings with past dates
    sortBy?: string; // slotDate | customerName | status | createdAt | updatedAt
    sortDir?: 'asc' | 'desc';
  }): Promise<{ bookings: schema.Booking[]; total: number }>;
  getBookingsForCustomer(customerPhone: string, userId: number, options?: { 
    status?: string; 
    upcoming?: boolean 
  }): Promise<schema.Booking[]>;
  getBooking(id: number): Promise<schema.Booking | undefined>;
  createBooking(booking: schema.InsertBooking): Promise<schema.Booking>;
  updateBooking(id: number, data: Partial<schema.Booking>): Promise<schema.Booking | undefined>;
  deleteBooking(id: number): Promise<void>;
  getBookingsForCalendar(userId: number, filters: {
    from: string;
    to: string;
    departmentId?: number;
    staffId?: number;
    status?: string;
  }): Promise<CalendarBooking[]>;
  checkSlotAvailability(staffId: number, slotDate: string, startTime: string, endTime: string, excludeBookingId?: number, userId?: number): Promise<{ available: boolean; existingCount: number; capacity: number }>;
  getBulkBookingCounts(staffId: number, dateRange: { startDate: string; endDate: string }, userId?: number): Promise<Map<string, number>>;
  countActiveBookingsForCustomer(customerPhone: string, userId: number, nodeId?: string): Promise<number>;
  countOutdatedConfirmedBookings(userId: number): Promise<number>;
  bulkCompleteOutdatedBookings(userId: number): Promise<number>;
  bulkUpdateBookingStatus(userId: number, ids: number[], status: string): Promise<number>;
  
  // Appointment Reminders
  getBookingsNeedingReminders(): Promise<schema.Booking[]>;
  markBookingReminderSent(bookingId: number): Promise<void>;
  
  // User Booking Settings
  getUserBookingSettings(userId: number): Promise<schema.UserBookingSettings | undefined>;
  updateUserBookingSettings(userId: number, settings: Partial<{
    confirmMessage: string | null;
    rescheduleMessage: string | null;
    cancelMessage: string | null;
    customDayNames: string[] | null;
  }>): Promise<schema.UserBookingSettings>;

  // Booking Custom Fields (user-defined, max 5 per tenant)
  getBookingCustomFieldsForUser(userId: number): Promise<schema.BookingCustomField[]>;
  getBookingCustomField(id: number): Promise<schema.BookingCustomField | undefined>;
  createBookingCustomField(data: schema.InsertBookingCustomField): Promise<schema.BookingCustomField>;
  updateBookingCustomField(id: number, data: Partial<schema.BookingCustomField>): Promise<schema.BookingCustomField | undefined>;
  softDeleteBookingCustomField(id: number): Promise<void>;
  reorderBookingCustomFields(userId: number, ids: number[]): Promise<void>;
  countActiveBookingCustomFields(userId: number): Promise<number>;

  // Manual booking (Phase 3B)
  checkBookingOverlap(staffId: number, slotDate: string, startTime: string, endTime: string, userId: number, excludeBookingId?: number, endDate?: string, endDayStartTime?: string, endDayEndTime?: string): Promise<{ available: boolean; conflictingCount: number }>;
  createManualBookingWithValues(booking: schema.InsertBooking, values: { fieldId: number; value: string }[]): Promise<{ booking: schema.Booking; values: schema.BookingCustomFieldValue[] }>;
  getBookingCustomFieldValues(bookingId: number): Promise<schema.BookingCustomFieldValue[]>;
  getBookingCustomFieldValuesForBookings(bookingIds: number[]): Promise<schema.BookingCustomFieldValue[]>;
  setBookingCustomFieldValues(bookingId: number, values: { fieldId: number; value: string }[]): Promise<void>;
  mergeBookingCustomFieldValues(bookingId: number, updates: { fieldId: number; value: string }[]): Promise<void>;

  // Booking share links (Feature 3)
  createShareLink(data: {
    userId: number;
    slot: number;
    tokenHash: string;
    passwordHash: string;
    description?: string | null;
    config: schema.ShareLinkConfig;
    configVersion?: number;
    isEnabled?: boolean;
    expiresAt?: Date | null;
    tokenCreatedAt?: Date | null;
  }): Promise<schema.BookingShareLink>;
  listShareLinks(userId: number): Promise<schema.BookingShareLink[]>;
  getShareLink(id: number): Promise<schema.BookingShareLink | undefined>;
  getShareLinkByTokenHash(tokenHash: string): Promise<schema.BookingShareLink | undefined>;
  updateShareLink(id: number, data: Partial<schema.BookingShareLink>): Promise<schema.BookingShareLink | undefined>;
  toggleShareLink(id: number): Promise<schema.BookingShareLink | undefined>;
  deleteShareLink(id: number): Promise<void>;
  countShareLinks(userId: number): Promise<number>;

  // Web chat links (Phase 4A-3a-1) — one link per workflow, token stored hashed.
  getWebChatLinkForWorkflow(workflowId: number): Promise<schema.WebChatLink | null>;
  getWebChatLinkByTokenHash(tokenHash: string): Promise<schema.WebChatLink | null>;
  getWebChatLink(id: number): Promise<schema.WebChatLink | null>;
  createWebChatLink(data: {
    userId: number;
    workflowId: number;
    tokenHash: string;
    label?: string | null;
    expiresAt?: Date | null;
  }): Promise<schema.WebChatLink>;
  updateWebChatLink(id: number, data: Partial<schema.WebChatLink>): Promise<schema.WebChatLink | null>;
  deleteWebChatLink(id: number): Promise<void>;
  getWebChatLinkStats(linkId: number): Promise<{ sessionCount: number; lastMessageAt: Date | null }>;

  // Web chat sessions — one per visitor; sessionKey is the conversation_states.phone value.
  getWebChatSession(id: number): Promise<schema.WebChatSession | null>;
  getWebChatSessionByKey(sessionKey: string): Promise<schema.WebChatSession | null>;
  createWebChatSession(data: {
    workflowId: number;
    linkId: number;
    sessionKey: string;
    ipHash?: string | null;
    userAgentHash?: string | null;
    status?: string;
  }): Promise<schema.WebChatSession>;
  updateWebChatSession(id: number, data: Partial<schema.WebChatSession>): Promise<schema.WebChatSession | null>;
  endWebChatSession(id: number): Promise<schema.WebChatSession | null>;

  // Web chat messages — transcript + poll cursor (`id` is monotonic).
  createWebChatMessage(data: {
    sessionId: number;
    workflowId: number;
    role: string;
    kind: string;
    nodeId?: string | null;
    payload?: Record<string, unknown>;
    clientMsgId?: string | null;
  }): Promise<schema.WebChatMessage>;
  getWebChatMessagesSince(sessionId: number, sinceId: number, limit: number): Promise<schema.WebChatMessage[]>;
  getWebChatMessagesForSession(sessionId: number, limit: number): Promise<schema.WebChatMessage[]>;
  // Phase 4A-3a-2: idempotency replay lookup. Backed by the unique index
  // (session_id, client_msg_id); bot/system rows have client_msg_id NULL so they
  // never match.
  getWebChatMessageByClientMsgId(
    sessionId: number,
    clientMsgId: string
  ): Promise<schema.WebChatMessage | null>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: Omit<InsertUser, "passwordHash"> & { passwordHash: string }): Promise<User> {
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return user || undefined;
  }

  async deleteUser(id: number): Promise<void> {
    console.log(`[Storage] Deleting user ${id} - CASCADE constraints will handle related data`);
    // All CASCADE and SET NULL constraints are configured in the database schema
    // Just delete the user and let the database handle cleanup
    await db.delete(schema.users).where(eq(schema.users.id, id));
    console.log(`[Storage] User ${id} deleted successfully`);
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
  }

  // Plans
  async getPlans(): Promise<Plan[]> {
    return await db.select().from(schema.plans).orderBy(schema.plans.price);
  }

  async getPlan(id: number): Promise<Plan | undefined> {
    const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, id));
    return plan || undefined;
  }

  async createPlan(insertPlan: InsertPlan): Promise<Plan> {
    const [plan] = await db.insert(schema.plans).values(insertPlan).returning();
    return plan;
  }

  async updatePlan(id: number, data: Partial<Plan>): Promise<Plan | undefined> {
    const [plan] = await db
      .update(schema.plans)
      .set(data)
      .where(eq(schema.plans.id, id))
      .returning();
    return plan;
  }

  async deletePlan(id: number): Promise<void> {
    await db.delete(schema.plans).where(eq(schema.plans.id, id));
  }

  // Coupons
  async getCoupons(): Promise<Coupon[]> {
    return await db.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt));
  }

  async getCoupon(id: number): Promise<Coupon | undefined> {
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, id));
    return coupon || undefined;
  }

  async getCouponByCode(code: string): Promise<Coupon | undefined> {
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    return coupon || undefined;
  }

  async createCoupon(insertCoupon: InsertCoupon): Promise<Coupon> {
    const [coupon] = await db.insert(schema.coupons).values(insertCoupon).returning();
    return coupon;
  }

  async updateCoupon(id: number, data: Partial<Coupon>): Promise<Coupon | undefined> {
    const [coupon] = await db
      .update(schema.coupons)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.coupons.id, id))
      .returning();
    return coupon || undefined;
  }

  async deleteCoupon(id: number): Promise<void> {
    await db.delete(schema.coupons).where(eq(schema.coupons.id, id));
  }

  async validateCoupon(code: string, userId: number, planId: number): Promise<{ valid: boolean; message: string; coupon?: Coupon }> {
    const coupon = await this.getCouponByCode(code);
    
    if (!coupon) {
      return { valid: false, message: "Invalid coupon code" };
    }

    if (coupon.status !== "ACTIVE") {
      return { valid: false, message: "Coupon is not active" };
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return { valid: false, message: "Coupon has expired" };
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, message: "Coupon usage limit reached" };
    }

    if (coupon.planScope === "SPECIFIC" && coupon.allowedPlanIds) {
      const allowedPlans = coupon.allowedPlanIds as number[];
      if (!allowedPlans.includes(planId)) {
        return { valid: false, message: "Coupon not valid for this plan" };
      }
    }

    if (coupon.planScope === "USER_SPECIFIC" && coupon.allowedUserIds) {
      const allowedUsers = coupon.allowedUserIds as number[];
      if (!allowedUsers.includes(userId)) {
        return { valid: false, message: "Coupon not valid for your account" };
      }
    }

    return { valid: true, message: "Coupon is valid", coupon };
  }

  async incrementCouponUsage(id: number): Promise<void> {
    await db
      .update(schema.coupons)
      .set({ usedCount: sql`${schema.coupons.usedCount} + 1`, updatedAt: new Date() })
      .where(eq(schema.coupons.id, id));
  }

  // Subscriptions
  async getActiveSubscriptionForUser(userId: number): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, "ACTIVE")))
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);
    return subscription || undefined;
  }

  async getSubscriptionsWithAutoExtend(): Promise<Subscription[]> {
    return await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.status, "ACTIVE"),
          eq(schema.subscriptions.autoExtendEnabled, true)
        )
      );
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    const [subscription] = await db.insert(schema.subscriptions).values(insertSubscription).returning();
    return subscription;
  }

  async updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription | undefined> {
    const [subscription] = await db
      .update(schema.subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, id))
      .returning();
    return subscription || undefined;
  }

  // Channels
  async getChannelsForUser(userId: number): Promise<Channel[]> {
    return await db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.userId, userId))
      .orderBy(desc(schema.channels.createdAt));
  }

  async getChannel(id: number): Promise<Channel | undefined> {
    const [channel] = await db.select().from(schema.channels).where(eq(schema.channels.id, id));
    return channel || undefined;
  }

  async createChannel(insertChannel: InsertChannel): Promise<Channel> {
    const [channel] = await db.insert(schema.channels).values(insertChannel).returning();
    return channel;
  }

  async updateChannel(id: number, data: Partial<Channel>): Promise<Channel | undefined> {
    const [channel] = await db
      .update(schema.channels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.channels.id, id))
      .returning();
    return channel || undefined;
  }

  async deleteChannel(id: number): Promise<void> {
    await db.delete(schema.channels).where(eq(schema.channels.id, id));
  }

  // Templates
  async getTemplatesForUser(userId: number): Promise<Template[]> {
    return await db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.userId, userId))
      .orderBy(desc(schema.templates.createdAt));
  }

  async getTemplate(id: number): Promise<Template | undefined> {
    const [template] = await db.select().from(schema.templates).where(eq(schema.templates.id, id));
    return template || undefined;
  }

  async createTemplate(insertTemplate: InsertTemplate): Promise<Template> {
    const [template] = await db.insert(schema.templates).values(insertTemplate).returning();
    return template;
  }

  async updateTemplate(id: number, data: Partial<Template>): Promise<Template | undefined> {
    const [template] = await db
      .update(schema.templates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.templates.id, id))
      .returning();
    return template || undefined;
  }

  async deleteTemplate(id: number): Promise<void> {
    await db.delete(schema.templates).where(eq(schema.templates.id, id));
  }

  // Jobs
  async getJobsForUser(userId: number): Promise<Job[]> {
    return await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.userId, userId))
      .orderBy(desc(schema.jobs.createdAt));
  }

  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    return job || undefined;
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db.insert(schema.jobs).values(insertJob).returning();
    return job;
  }

  async updateJob(id: number, data: Partial<Job>): Promise<Job | undefined> {
    const [job] = await db
      .update(schema.jobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.jobs.id, id))
      .returning();
    return job || undefined;
  }

  async deleteJob(id: number): Promise<void> {
    // Messages will cascade delete due to foreign key constraint
    await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
  }

  // Messages
  async getMessagesForJob(jobId: number): Promise<Message[]> {
    return await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.jobId, jobId))
      .orderBy(desc(schema.messages.createdAt));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    // Normalize buttons: ensure they have 'title' field, not 'text'
    if (insertMessage.buttons && Array.isArray(insertMessage.buttons)) {
      console.log(`[Storage] createMessage raw buttons:`, JSON.stringify(insertMessage.buttons.slice(0, 1), null, 2));
      insertMessage.buttons = insertMessage.buttons.map((btn: any) => {
        const normalized: any = {
          type: btn.type || "quick_reply",
          id: btn.id,
        };
        // Always use 'title' field (WHAPI standard), fallback to 'text' if not available
        normalized.title = btn.title || btn.text || "Button";
        // Preserve optional fields
        if (btn.value !== undefined) normalized.value = btn.value;
        if (btn.phone_number) normalized.phone_number = btn.phone_number;
        if (btn.url) normalized.url = btn.url;
        if (btn.copy_code) normalized.copy_code = btn.copy_code;
        return normalized;
      });
      console.log(`[Storage] createMessage normalized buttons:`, JSON.stringify(insertMessage.buttons.slice(0, 1), null, 2));
    }
    const [message] = await db.insert(schema.messages).values(insertMessage).returning();
    console.log(`[Storage] Message created with buttons:`, JSON.stringify(message.buttons && Array.isArray(message.buttons) ? message.buttons.slice(0, 1) : message.buttons, null, 2));
    return message;
  }

  async updateMessage(id: number, data: Partial<Message>): Promise<Message | undefined> {
    const [message] = await db
      .update(schema.messages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.messages.id, id))
      .returning();
    return message || undefined;
  }

  // Workflows
  async getWorkflowsForUser(userId: number): Promise<Workflow[]> {
    return await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.userId, userId))
      .orderBy(desc(schema.workflows.createdAt));
  }

  async getWorkflow(id: number): Promise<Workflow | undefined> {
    const [workflow] = await db.select().from(schema.workflows).where(eq(schema.workflows.id, id));
    return workflow || undefined;
  }

  async createWorkflow(insertWorkflow: InsertWorkflow): Promise<Workflow> {
    const [workflow] = await db.insert(schema.workflows).values(insertWorkflow).returning();
    return workflow;
  }

  async updateWorkflow(id: number, data: Partial<Workflow>): Promise<Workflow | undefined> {
    const [workflow] = await db
      .update(schema.workflows)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.workflows.id, id))
      .returning();
    return workflow || undefined;
  }

  async deleteWorkflow(id: number): Promise<void> {
    await db.delete(schema.workflows).where(eq(schema.workflows.id, id));
  }

  async insertLead(lead: schema.InsertLead): Promise<schema.Lead> {
    const [row] = await db.insert(schema.leads).values(lead).returning();
    return row;
  }

  // Offline Payments
  async getOfflinePayments(status?: string): Promise<OfflinePayment[]> {
    if (status) {
      return await db
        .select()
        .from(schema.offlinePayments)
        .where(eq(schema.offlinePayments.status, status as any))
        .orderBy(desc(schema.offlinePayments.createdAt));
    }
    return await db.select().from(schema.offlinePayments).orderBy(desc(schema.offlinePayments.createdAt));
  }

  async getOfflinePayment(id: number): Promise<OfflinePayment | undefined> {
    const [payment] = await db.select().from(schema.offlinePayments).where(eq(schema.offlinePayments.id, id));
    return payment || undefined;
  }

  async createOfflinePayment(insertPayment: InsertOfflinePayment): Promise<OfflinePayment> {
    const [payment] = await db.insert(schema.offlinePayments).values(insertPayment).returning();
    return payment;
  }

  async updateOfflinePayment(id: number, data: Partial<OfflinePayment>): Promise<OfflinePayment | undefined> {
    const [payment] = await db
      .update(schema.offlinePayments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.offlinePayments.id, id))
      .returning();
    return payment || undefined;
  }

  async deleteOfflinePayment(id: number): Promise<void> {
    await db
      .delete(schema.offlinePayments)
      .where(eq(schema.offlinePayments.id, id));
  }

  // Plan Requests
  async getPlanRequests(status?: string): Promise<schema.PlanRequest[]> {
    if (status) {
      return await db
        .select()
        .from(schema.planRequests)
        .where(eq(schema.planRequests.status, status as any))
        .orderBy(desc(schema.planRequests.createdAt));
    }
    return await db.select().from(schema.planRequests).orderBy(desc(schema.planRequests.createdAt));
  }

  async getPlanRequest(id: number): Promise<schema.PlanRequest | undefined> {
    const [request] = await db.select().from(schema.planRequests).where(eq(schema.planRequests.id, id));
    return request || undefined;
  }

  async createPlanRequest(insertRequest: schema.InsertPlanRequest): Promise<schema.PlanRequest> {
    const [request] = await db.insert(schema.planRequests).values(insertRequest).returning();
    return request;
  }

  async updatePlanRequest(id: number, data: Partial<schema.PlanRequest>): Promise<schema.PlanRequest | undefined> {
    const [request] = await db
      .update(schema.planRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.planRequests.id, id))
      .returning();
    return request || undefined;
  }

  // Audit Logs
  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(schema.auditLogs).values(insertLog).returning();
    return log;
  }

  // Settings
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    return setting || undefined;
  }

  async setSetting(key: string, value: string | null): Promise<Setting> {
    const existing = await this.getSetting(key);
    if (existing) {
      const [updated] = await db
        .update(schema.settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.settings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.settings).values({ key, value }).returning();
      return created;
    }
  }

  async getSettingsByPrefix(prefix: string): Promise<Setting[]> {
    return await db
      .select()
      .from(schema.settings)
      .where(like(schema.settings.key, `${prefix}%`));
  }

  // Balance Transactions
  async createBalanceTransaction(
    insertTransaction: Omit<schema.InsertBalanceTransaction, "createdAt">
  ): Promise<schema.BalanceTransaction> {
    const [transaction] = await db
      .insert(schema.balanceTransactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  async getBalanceTransactions(limit?: number): Promise<schema.BalanceTransaction[]> {
    const query = db
      .select()
      .from(schema.balanceTransactions)
      .orderBy(desc(schema.balanceTransactions.createdAt));
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async getBalanceTransaction(id: number): Promise<schema.BalanceTransaction | null> {
    const [transaction] = await db
      .select()
      .from(schema.balanceTransactions)
      .where(eq(schema.balanceTransactions.id, id));
    return transaction || null;
  }

  async deleteBalanceTransaction(id: number): Promise<void> {
    await db.delete(schema.balanceTransactions).where(eq(schema.balanceTransactions.id, id));
  }

  async getMainDaysBalance(): Promise<number> {
    const setting = await this.getSetting("main_days_balance");
    return setting ? parseInt(setting.value || "0") : 0;
  }

  async updateMainDaysBalance(change: number): Promise<number> {
    const currentBalance = await this.getMainDaysBalance();
    const newBalance = currentBalance + change;
    
    // Prevent negative balance
    if (newBalance < 0) {
      throw new Error(`Insufficient main balance. Current: ${currentBalance}, Requested change: ${change}`);
    }
    
    await this.setSetting("main_days_balance", newBalance.toString());
    return newBalance;
  }

  // Channel Days Ledger
  async addDaysToChannel(params: {
    channelId: number;
    days: number;
    source: "ADMIN_MANUAL" | "PAYPAL" | "OFFLINE" | "MIGRATION";
    balanceTransactionId?: number;
    subscriptionId?: number;
    offlinePaymentId?: number;
    metadata?: any;
  }): Promise<{ ledgerEntry: ChannelDaysLedger; updatedChannel: Channel }> {
    const channel = await this.getChannel(params.channelId);
    if (!channel) {
      throw new Error(`Channel ${params.channelId} not found`);
    }

    // Create ledger entry
    const [ledgerEntry] = await db
      .insert(schema.channelDaysLedger)
      .values({
        channelId: params.channelId,
        days: params.days,
        source: params.source,
        balanceTransactionId: params.balanceTransactionId,
        subscriptionId: params.subscriptionId,
        offlinePaymentId: params.offlinePaymentId,
        metadata: params.metadata || {},
      })
      .returning();

    // Calculate new expiration date
    const now = new Date();
    let newExpiresAt: Date;
    let newActiveFrom: Date | null = channel.activeFrom;
    let newStatus: "PENDING" | "ACTIVE" | "PAUSED" = channel.status;

    if (channel.status === "PENDING" || !channel.expiresAt) {
      // First activation
      newActiveFrom = now;
      newExpiresAt = new Date(now.getTime() + params.days * 24 * 60 * 60 * 1000);
      newStatus = "ACTIVE";
    } else {
      // Extending existing channel
      const currentExpiry = new Date(channel.expiresAt);
      if (currentExpiry > now) {
        // Add to existing expiry
        newExpiresAt = new Date(currentExpiry.getTime() + params.days * 24 * 60 * 60 * 1000);
      } else {
        // Expired, start fresh from now
        newActiveFrom = now;
        newExpiresAt = new Date(now.getTime() + params.days * 24 * 60 * 60 * 1000);
        newStatus = "ACTIVE";
      }
    }

    // Calculate remaining days
    const daysRemaining = Math.max(0, Math.ceil((newExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    // Update channel
    const [updatedChannel] = await db
      .update(schema.channels)
      .set({
        status: newStatus,
        activeFrom: newActiveFrom,
        expiresAt: newExpiresAt,
        daysRemaining,
        lastExtendedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.channels.id, params.channelId))
      .returning();

    return { ledgerEntry, updatedChannel };
  }

  async getChannelDaysLedger(channelId: number): Promise<ChannelDaysLedger[]> {
    return await db
      .select()
      .from(schema.channelDaysLedger)
      .where(eq(schema.channelDaysLedger.channelId, channelId))
      .orderBy(desc(schema.channelDaysLedger.createdAt));
  }

  async calculateChannelDaysRemaining(channelId: number): Promise<number> {
    const channel = await this.getChannel(channelId);
    if (!channel || !channel.expiresAt) {
      return 0;
    }

    const now = new Date();
    const expiresAt = new Date(channel.expiresAt);
    
    if (expiresAt <= now) {
      return 0;
    }

    return Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  }

  // Bulk Logs
  async createBulkLog(log: schema.InsertBulkLog): Promise<schema.BulkLog> {
    const [newLog] = await db.insert(schema.bulkLogs).values(log).returning();
    return newLog;
  }

  async getBulkLogs(filters?: {
    userId?: number;
    jobId?: number;
    level?: string;
    category?: string;
    limit?: number;
  }): Promise<schema.BulkLog[]> {
    let query = db.select().from(schema.bulkLogs);

    const conditions = [];
    if (filters?.userId) {
      conditions.push(eq(schema.bulkLogs.userId, filters.userId));
    }
    if (filters?.jobId) {
      conditions.push(eq(schema.bulkLogs.jobId, filters.jobId));
    }
    if (filters?.level) {
      conditions.push(eq(schema.bulkLogs.level, filters.level as any));
    }
    if (filters?.category) {
      conditions.push(eq(schema.bulkLogs.category, filters.category as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    query = query.orderBy(desc(schema.bulkLogs.createdAt)) as any;

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    return await query;
  }

  // Label Logs
  async createLabelLog(log: schema.InsertLabelLog): Promise<schema.LabelLog> {
    const [newLog] = await db.insert(schema.labelLogs).values(log).returning();
    return newLog;
  }

  async getLabelLogs(filters?: {
    userId?: number;
    channelId?: number;
    operation?: string;
    status?: string;
    limit?: number;
  }): Promise<schema.LabelLog[]> {
    let query = db.select().from(schema.labelLogs);

    const conditions = [];
    if (filters?.userId) {
      conditions.push(eq(schema.labelLogs.userId, filters.userId));
    }
    if (filters?.channelId) {
      conditions.push(eq(schema.labelLogs.channelId, filters.channelId));
    }
    if (filters?.operation) {
      conditions.push(eq(schema.labelLogs.operation, filters.operation as any));
    }
    if (filters?.status) {
      conditions.push(eq(schema.labelLogs.status, filters.status as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    query = query.orderBy(desc(schema.labelLogs.createdAt)) as any;

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    } else {
      query = query.limit(100) as any; // Default limit
    }

    return await query;
  }

  // Terms & Conditions
  async getActiveTermsDocuments(): Promise<schema.TermsDocument[]> {
    return await db
      .select()
      .from(schema.termsDocuments)
      .where(eq(schema.termsDocuments.isActive, true))
      .orderBy(schema.termsDocuments.type);
  }

  async getTermsDocument(id: number): Promise<schema.TermsDocument | undefined> {
    const [doc] = await db
      .select()
      .from(schema.termsDocuments)
      .where(eq(schema.termsDocuments.id, id));
    return doc || undefined;
  }

  async getTermsDocumentByType(type: string): Promise<schema.TermsDocument | undefined> {
    const [doc] = await db
      .select()
      .from(schema.termsDocuments)
      .where(and(
        eq(schema.termsDocuments.type, type),
        eq(schema.termsDocuments.isActive, true)
      ))
      .orderBy(desc(schema.termsDocuments.createdAt))
      .limit(1);
    return doc || undefined;
  }

  async createTermsDocument(document: schema.InsertTermsDocument): Promise<schema.TermsDocument> {
    const [doc] = await db.insert(schema.termsDocuments).values(document).returning();
    return doc;
  }

  async updateTermsDocument(id: number, data: Partial<schema.TermsDocument>): Promise<schema.TermsDocument | undefined> {
    const [doc] = await db
      .update(schema.termsDocuments)
      .set(data)
      .where(eq(schema.termsDocuments.id, id))
      .returning();
    return doc || undefined;
  }

  async setActiveTermsDocument(id: number): Promise<schema.TermsDocument | undefined> {
    const doc = await this.getTermsDocument(id);
    if (!doc) {
      return undefined;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.termsDocuments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.termsDocuments.type, doc.type));

      await tx
        .update(schema.termsDocuments)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(schema.termsDocuments.id, id));
    });

    return await this.getTermsDocument(id);
  }

  // Webhook Events
  async getWebhookEvent(provider: string, eventId: string): Promise<schema.WebhookEvent | undefined> {
    const [event] = await db
      .select()
      .from(schema.webhookEvents)
      .where(and(
        eq(schema.webhookEvents.provider, provider),
        eq(schema.webhookEvents.eventId, eventId)
      ));
    return event || undefined;
  }

  async createWebhookEvent(event: schema.InsertWebhookEvent): Promise<schema.WebhookEvent> {
    const [newEvent] = await db.insert(schema.webhookEvents).values(event).returning();
    return newEvent;
  }

  async markWebhookProcessed(id: number, error?: string): Promise<schema.WebhookEvent | undefined> {
    const [event] = await db
      .update(schema.webhookEvents)
      .set({
        processed: true,
        processedAt: new Date(),
        error: error || null,
      })
      .where(eq(schema.webhookEvents.id, id))
      .returning();
    return event || undefined;
  }

  // Ledger
  async createLedgerEntry(entry: schema.InsertLedger): Promise<schema.Ledger> {
    const [ledgerEntry] = await db.insert(schema.ledger).values(entry).returning();
    return ledgerEntry;
  }

  async getLedgerEntries(userId?: number, limit: number = 100): Promise<schema.Ledger[]> {
    let query = db.select().from(schema.ledger);
    
    if (userId) {
      query = query.where(eq(schema.ledger.userId, userId)) as any;
    }
    
    query = query.orderBy(desc(schema.ledger.createdAt)).limit(limit) as any;
    
    return await query;
  }

  // Phonebooks
  async getPhonebooksForUser(userId: number): Promise<schema.Phonebook[]> {
    return await db
      .select()
      .from(schema.phonebooks)
      .where(eq(schema.phonebooks.userId, userId))
      .orderBy(desc(schema.phonebooks.createdAt));
  }

  async getPhonebook(id: number): Promise<schema.Phonebook | undefined> {
    const [phonebook] = await db
      .select()
      .from(schema.phonebooks)
      .where(eq(schema.phonebooks.id, id));
    return phonebook || undefined;
  }

  async createPhonebook(phonebook: schema.InsertPhonebook): Promise<schema.Phonebook> {
    const [newPhonebook] = await db.insert(schema.phonebooks).values(phonebook).returning();
    return newPhonebook;
  }

  async updatePhonebook(id: number, data: Partial<schema.Phonebook>): Promise<schema.Phonebook | undefined> {
    const [phonebook] = await db
      .update(schema.phonebooks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.phonebooks.id, id))
      .returning();
    return phonebook || undefined;
  }

  async deletePhonebook(id: number): Promise<void> {
    await db.delete(schema.phonebooks).where(eq(schema.phonebooks.id, id));
  }

  // Phonebook Contacts
  async getContactsForPhonebook(phonebookId: number): Promise<schema.PhonebookContact[]> {
    return await db
      .select()
      .from(schema.phonebookContacts)
      .where(eq(schema.phonebookContacts.phonebookId, phonebookId))
      .orderBy(desc(schema.phonebookContacts.createdAt));
  }

  async getContact(id: number): Promise<schema.PhonebookContact | undefined> {
    const [contact] = await db
      .select()
      .from(schema.phonebookContacts)
      .where(eq(schema.phonebookContacts.id, id));
    return contact || undefined;
  }

  async createContact(contact: schema.InsertPhonebookContact): Promise<schema.PhonebookContact> {
    const [newContact] = await db.insert(schema.phonebookContacts).values(contact).returning();
    return newContact;
  }

  async createContactsBatch(contacts: schema.InsertPhonebookContact[]): Promise<number> {
    if (contacts.length === 0) return 0;
    
    // Insert in batches of 100 to avoid query size limits
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);
      try {
        await db.insert(schema.phonebookContacts).values(batch);
        insertedCount += batch.length;
      } catch (error) {
        console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error);
        // Continue with remaining batches even if one fails
      }
    }
    
    return insertedCount;
  }

  async updateContact(id: number, data: Partial<schema.PhonebookContact>): Promise<schema.PhonebookContact | undefined> {
    const [contact] = await db
      .update(schema.phonebookContacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.phonebookContacts.id, id))
      .returning();
    return contact || undefined;
  }

  async deleteContact(id: number): Promise<void> {
    await db.delete(schema.phonebookContacts).where(eq(schema.phonebookContacts.id, id));
  }

  // Media Uploads
  async createMediaUpload(upload: schema.InsertMediaUpload): Promise<schema.MediaUpload> {
    const [newUpload] = await db.insert(schema.mediaUploads).values(upload).returning();
    return newUpload;
  }

  async getMediaUploadsForUser(userId: number, limit: number = 100): Promise<schema.MediaUpload[]> {
    return await db
      .select()
      .from(schema.mediaUploads)
      .where(eq(schema.mediaUploads.userId, userId))
      .orderBy(desc(schema.mediaUploads.createdAt))
      .limit(limit);
  }

  async getMediaUpload(id: number): Promise<schema.MediaUpload | undefined> {
    const [upload] = await db
      .select()
      .from(schema.mediaUploads)
      .where(eq(schema.mediaUploads.id, id));
    return upload || undefined;
  }

  // Subscribers
  async getSubscribersForUser(
    userId: number, 
    filters?: { 
      status?: 'subscribed' | 'unsubscribed'; 
      page?: number; 
      pageSize?: number; 
    }
  ): Promise<{ subscribers: schema.Subscriber[]; total: number }> {
    const conditions = [eq(schema.subscribers.userId, userId)];
    
    if (filters?.status) {
      conditions.push(eq(schema.subscribers.status, filters.status));
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.subscribers)
      .where(and(...conditions));
    
    const total = count || 0;

    // Get paginated data
    const page = filters?.page || 1;
    const pageSize = Math.min(filters?.pageSize || 20, 100); // Max 100 per page
    const offset = (page - 1) * pageSize;

    const subscribers = await db
      .select()
      .from(schema.subscribers)
      .where(and(...conditions))
      .orderBy(desc(schema.subscribers.lastUpdated))
      .limit(pageSize)
      .offset(offset);

    return { subscribers, total };
  }

  async getSubscriber(id: number): Promise<schema.Subscriber | undefined> {
    const [subscriber] = await db
      .select()
      .from(schema.subscribers)
      .where(eq(schema.subscribers.id, id));
    return subscriber || undefined;
  }

  async upsertSubscriber(data: { 
    userId: number; 
    phone: string; 
    name?: string; 
    status: 'subscribed' | 'unsubscribed' 
  }): Promise<schema.Subscriber> {
    // Check if subscriber exists
    const [existing] = await db
      .select()
      .from(schema.subscribers)
      .where(
        and(
          eq(schema.subscribers.userId, data.userId),
          eq(schema.subscribers.phone, data.phone)
        )
      );

    const now = new Date();
    
    if (existing) {
      // Update existing subscriber
      const updateData: any = {
        status: data.status,
        lastUpdated: now,
      };

      if (data.name !== undefined) {
        updateData.name = data.name;
      }

      // Update timestamps based on status
      if (data.status === 'subscribed') {
        updateData.subscribedAt = now;
        updateData.unsubscribedAt = null;
      } else if (data.status === 'unsubscribed') {
        updateData.unsubscribedAt = now;
      }

      const [updated] = await db
        .update(schema.subscribers)
        .set(updateData)
        .where(eq(schema.subscribers.id, existing.id))
        .returning();
      
      return updated;
    } else {
      // Create new subscriber
      const insertData: any = {
        userId: data.userId,
        phone: data.phone,
        name: data.name || "",
        status: data.status,
        lastUpdated: now,
      };

      if (data.status === 'subscribed') {
        insertData.subscribedAt = now;
      } else if (data.status === 'unsubscribed') {
        insertData.unsubscribedAt = now;
      }

      const [created] = await db
        .insert(schema.subscribers)
        .values(insertData)
        .returning();
      
      return created;
    }
  }

  async updateSubscriber(id: number, data: Partial<schema.Subscriber>): Promise<schema.Subscriber | undefined> {
    const [subscriber] = await db
      .update(schema.subscribers)
      .set({ ...data, lastUpdated: new Date() })
      .where(eq(schema.subscribers.id, id))
      .returning();
    return subscriber || undefined;
  }

  async deleteSubscriber(id: number): Promise<void> {
    await db.delete(schema.subscribers).where(eq(schema.subscribers.id, id));
  }

  // Capture Sequences
  async getCaptureSequencesForUser(userId: number): Promise<schema.CaptureSequence[]> {
    return await db
      .select()
      .from(schema.captureSequences)
      .where(eq(schema.captureSequences.userId, userId))
      .orderBy(desc(schema.captureSequences.createdAt));
  }

  async getCaptureSequencesForWorkflow(workflowId: number): Promise<schema.CaptureSequence[]> {
    return await db
      .select()
      .from(schema.captureSequences)
      .where(eq(schema.captureSequences.workflowId, workflowId))
      .orderBy(schema.captureSequences.sequenceName);
  }

  async getCaptureSequence(id: number): Promise<schema.CaptureSequence | undefined> {
    const [sequence] = await db
      .select()
      .from(schema.captureSequences)
      .where(eq(schema.captureSequences.id, id));
    return sequence || undefined;
  }

  async getCaptureSequenceByNodeId(workflowId: number, nodeId: string): Promise<schema.CaptureSequence | undefined> {
    const [sequence] = await db
      .select()
      .from(schema.captureSequences)
      .where(
        and(
          eq(schema.captureSequences.workflowId, workflowId),
          or(
            eq(schema.captureSequences.startNodeId, nodeId),
            eq(schema.captureSequences.endNodeId, nodeId)
          )
        )
      );
    return sequence || undefined;
  }

  async createCaptureSequence(sequence: schema.InsertCaptureSequence): Promise<schema.CaptureSequence> {
    const [newSequence] = await db
      .insert(schema.captureSequences)
      .values(sequence)
      .returning();
    return newSequence;
  }

  async updateCaptureSequence(id: number, data: Partial<schema.CaptureSequence>): Promise<schema.CaptureSequence | undefined> {
    const [sequence] = await db
      .update(schema.captureSequences)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.captureSequences.id, id))
      .returning();
    return sequence || undefined;
  }

  async deleteCaptureSequence(id: number): Promise<void> {
    await db.delete(schema.captureSequences).where(eq(schema.captureSequences.id, id));
  }

  async countCaptureSequencesForUser(userId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.captureSequences)
      .where(eq(schema.captureSequences.userId, userId));
    return result[0]?.count || 0;
  }

  // Captured Data
  async getCapturedDataForSequence(
    sequenceId: number, 
    page: number = 1, 
    pageSize: number = 20
  ): Promise<{ entries: schema.CapturedData[]; total: number }> {
    const offset = (page - 1) * pageSize;
    
    const entries = await db
      .select()
      .from(schema.capturedData)
      .where(eq(schema.capturedData.sequenceId, sequenceId))
      .orderBy(desc(schema.capturedData.savedAt))
      .limit(pageSize)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.capturedData)
      .where(eq(schema.capturedData.sequenceId, sequenceId));

    return { entries, total: countResult?.count || 0 };
  }

  async getCapturedDataForUser(
    userId: number, 
    filters?: { workflowId?: number; page?: number; pageSize?: number }
  ): Promise<{ entries: schema.CapturedData[]; total: number }> {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let whereClause = eq(schema.capturedData.userId, userId);

    const entries = await db
      .select()
      .from(schema.capturedData)
      .where(whereClause)
      .orderBy(desc(schema.capturedData.savedAt))
      .limit(pageSize)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.capturedData)
      .where(whereClause);

    return { entries, total: countResult?.count || 0 };
  }

  async getCapturedDataEntry(id: number): Promise<schema.CapturedData | undefined> {
    const [entry] = await db
      .select()
      .from(schema.capturedData)
      .where(eq(schema.capturedData.id, id));
    return entry || undefined;
  }

  async createCapturedData(data: schema.InsertCapturedData): Promise<schema.CapturedData> {
    const [newEntry] = await db
      .insert(schema.capturedData)
      .values(data)
      .returning();
    return newEntry;
  }

  async deleteCapturedData(id: number): Promise<void> {
    await db.delete(schema.capturedData).where(eq(schema.capturedData.id, id));
  }

  async countCapturedDataForSequence(sequenceId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.capturedData)
      .where(eq(schema.capturedData.sequenceId, sequenceId));
    return result[0]?.count || 0;
  }

  // ============================================================================
  // BOOKING SCHEDULER METHODS
  // ============================================================================

  // Services (groups departments)
  async getBookingServicesForUser(userId: number): Promise<schema.BookingService[]> {
    return await db
      .select()
      .from(schema.bookingServices)
      .where(eq(schema.bookingServices.userId, userId))
      .orderBy(schema.bookingServices.name);
  }

  async getBookingService(id: number): Promise<schema.BookingService | undefined> {
    const [service] = await db
      .select()
      .from(schema.bookingServices)
      .where(eq(schema.bookingServices.id, id));
    return service || undefined;
  }

  async createBookingService(service: schema.InsertBookingService): Promise<schema.BookingService> {
    const [newService] = await db
      .insert(schema.bookingServices)
      .values(service)
      .returning();
    return newService;
  }

  async updateBookingService(id: number, data: Partial<schema.BookingService>): Promise<schema.BookingService | undefined> {
    const [updated] = await db
      .update(schema.bookingServices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.bookingServices.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteBookingService(id: number): Promise<void> {
    await db.delete(schema.bookingServices).where(eq(schema.bookingServices.id, id));
  }

  // Departments
  async getBookingDepartmentsForUser(userId: number): Promise<schema.BookingDepartment[]> {
    return await db
      .select()
      .from(schema.bookingDepartments)
      .where(eq(schema.bookingDepartments.userId, userId))
      .orderBy(schema.bookingDepartments.name);
  }

  async getBookingDepartmentsForService(serviceId: number): Promise<schema.BookingDepartment[]> {
    return await db
      .select()
      .from(schema.bookingDepartments)
      .where(eq(schema.bookingDepartments.serviceId, serviceId))
      .orderBy(schema.bookingDepartments.name);
  }

  async getBookingDepartment(id: number): Promise<schema.BookingDepartment | undefined> {
    const [dept] = await db
      .select()
      .from(schema.bookingDepartments)
      .where(eq(schema.bookingDepartments.id, id));
    return dept || undefined;
  }

  async createBookingDepartment(dept: schema.InsertBookingDepartment): Promise<schema.BookingDepartment> {
    const [newDept] = await db
      .insert(schema.bookingDepartments)
      .values(dept)
      .returning();
    return newDept;
  }

  async updateBookingDepartment(id: number, data: Partial<schema.BookingDepartment>): Promise<schema.BookingDepartment | undefined> {
    const [updated] = await db
      .update(schema.bookingDepartments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.bookingDepartments.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteBookingDepartment(id: number): Promise<void> {
    await db.delete(schema.bookingDepartments).where(eq(schema.bookingDepartments.id, id));
  }

  // Staff
  async getBookingStaffForDepartment(departmentId: number): Promise<schema.BookingStaff[]> {
    return await db
      .select()
      .from(schema.bookingStaff)
      .where(eq(schema.bookingStaff.departmentId, departmentId))
      .orderBy(schema.bookingStaff.name);
  }

  async getBookingStaffForUser(userId: number): Promise<schema.BookingStaff[]> {
    return await db
      .select()
      .from(schema.bookingStaff)
      .where(eq(schema.bookingStaff.userId, userId))
      .orderBy(schema.bookingStaff.name);
  }

  async getBookingStaff(id: number): Promise<schema.BookingStaff | undefined> {
    const [staff] = await db
      .select()
      .from(schema.bookingStaff)
      .where(eq(schema.bookingStaff.id, id));
    return staff || undefined;
  }

  async createBookingStaff(staff: schema.InsertBookingStaff): Promise<schema.BookingStaff> {
    const [newStaff] = await db
      .insert(schema.bookingStaff)
      .values(staff)
      .returning();
    return newStaff;
  }

  async updateBookingStaff(id: number, data: Partial<schema.BookingStaff>): Promise<schema.BookingStaff | undefined> {
    const [updated] = await db
      .update(schema.bookingStaff)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.bookingStaff.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteBookingStaff(id: number): Promise<void> {
    await db.delete(schema.bookingStaff).where(eq(schema.bookingStaff.id, id));
  }

  // Slots
  async getBookingStaffSlots(staffId: number): Promise<schema.BookingStaffSlot[]> {
    return await db
      .select()
      .from(schema.bookingStaffSlots)
      .where(eq(schema.bookingStaffSlots.staffId, staffId))
      .orderBy(schema.bookingStaffSlots.dayOfWeek, schema.bookingStaffSlots.startTime);
  }

  async getBookingStaffSlot(id: number): Promise<schema.BookingStaffSlot | undefined> {
    const [slot] = await db
      .select()
      .from(schema.bookingStaffSlots)
      .where(eq(schema.bookingStaffSlots.id, id));
    return slot || undefined;
  }

  async createBookingStaffSlot(slot: schema.InsertBookingStaffSlot): Promise<schema.BookingStaffSlot> {
    const [newSlot] = await db
      .insert(schema.bookingStaffSlots)
      .values(slot)
      .returning();
    return newSlot;
  }

  async updateBookingStaffSlot(id: number, data: Partial<schema.BookingStaffSlot>): Promise<schema.BookingStaffSlot | undefined> {
    const [updated] = await db
      .update(schema.bookingStaffSlots)
      .set(data)
      .where(eq(schema.bookingStaffSlots.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteBookingStaffSlot(id: number): Promise<void> {
    await db.delete(schema.bookingStaffSlots).where(eq(schema.bookingStaffSlots.id, id));
  }

  // Bookings - Optimized for fast chatbot response
  async getBookingsForUser(
    userId: number,
    filters?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      staffId?: number;
      departmentId?: number;
      page?: number;
      pageSize?: number;
      search?: string;
      outdatedConfirmed?: boolean;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
    }
  ): Promise<{ bookings: schema.Booking[]; total: number }> {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const offset = (page - 1) * pageSize;
    const today = new Date().toISOString().split('T')[0];

    const conditions = [eq(schema.bookings.userId, userId)];

    // Handle special outdated confirmed filter at DB level
    if (filters?.outdatedConfirmed) {
      conditions.push(eq(schema.bookings.status, 'confirmed' as any));
      conditions.push(sql`COALESCE(${schema.bookings.endDate}, ${schema.bookings.slotDate}) < ${today}`);
    } else {
      if (filters?.status) {
        conditions.push(eq(schema.bookings.status, filters.status as any));
      }
      if (filters?.fromDate && filters?.toDate) {
        conditions.push(bookingDaySpanOverlaps(filters.fromDate, filters.toDate));
      } else {
        if (filters?.fromDate) {
          conditions.push(sql`COALESCE(${schema.bookings.endDate}, ${schema.bookings.slotDate}) >= ${filters.fromDate}`);
        }
        if (filters?.toDate) {
          conditions.push(sql`${schema.bookings.slotDate} <= ${filters.toDate}`);
        }
      }
    }
    
    if (filters?.staffId) {
      conditions.push(eq(schema.bookings.staffId, filters.staffId));
    }
    if (filters?.departmentId) {
      conditions.push(eq(schema.bookings.departmentId, filters.departmentId));
    }
    if (filters?.search) {
      const searchTerm = `%${filters.search.toLowerCase()}%`;
      conditions.push(sql`(
        LOWER(${schema.bookings.customerName}) LIKE ${searchTerm} OR 
        ${schema.bookings.customerPhone} LIKE ${searchTerm} OR 
        LOWER(${schema.bookings.bookingLabel}) LIKE ${searchTerm} OR
        ${schema.bookings.slotDate} LIKE ${searchTerm} OR
        LOWER(${schema.bookings.customField1Value}) LIKE ${searchTerm} OR
        LOWER(${schema.bookings.customField2Value}) LIKE ${searchTerm}
      )`);
    }

    // Dynamic sort: whitelist column + direction, with a stable tiebreak.
    const sortColumn = (() => {
      switch (filters?.sortBy) {
        case 'customerName': return schema.bookings.customerName;
        case 'status':       return schema.bookings.status;
        case 'createdAt':    return schema.bookings.createdAt;
        case 'updatedAt':    return schema.bookings.updatedAt;
        case 'slotDate':
        default:             return schema.bookings.slotDate;
      }
    })();
    const dir = filters?.sortDir === 'asc' ? asc : desc;
    const orderClause = [dir(sortColumn)];
    if (filters?.sortBy === undefined || filters.sortBy === 'slotDate') {
      // Date sort keeps startTime as the secondary key (matches default behavior)
      orderClause.push(dir(schema.bookings.startTime));
    } else {
      // Non-date sorts tie-break on the appointment datetime for stability
      orderClause.push(desc(schema.bookings.slotDate), desc(schema.bookings.startTime));
    }

    const bookingsList = await db
      .select()
      .from(schema.bookings)
      .where(and(...conditions))
      .orderBy(...orderClause)
      .limit(pageSize)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.bookings)
      .where(and(...conditions));

    return { bookings: bookingsList, total: countResult?.count || 0 };
  }

  async countOutdatedConfirmedBookings(userId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.bookings)
      .where(and(
        eq(schema.bookings.userId, userId),
        eq(schema.bookings.status, 'confirmed' as any),
        sql`COALESCE(${schema.bookings.endDate}, ${schema.bookings.slotDate}) < ${today}`
      ));
    return result?.count || 0;
  }

  async bulkCompleteOutdatedBookings(userId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const result = await db
      .update(schema.bookings)
      .set({ status: 'completed' })
      .where(and(
        eq(schema.bookings.userId, userId),
        eq(schema.bookings.status, 'confirmed' as any),
        sql`COALESCE(${schema.bookings.endDate}, ${schema.bookings.slotDate}) < ${today}`
      ))
      .returning({ id: schema.bookings.id });
    return result.length;
  }

  async bulkUpdateBookingStatus(userId: number, ids: number[], status: string): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(schema.bookings)
      .set({ status: status as any })
      .where(and(
        eq(schema.bookings.userId, userId),
        inArray(schema.bookings.id, ids)
      ))
      .returning({ id: schema.bookings.id });
    return result.length;
  }

  async getBookingsForCustomer(
    customerPhone: string,
    userId: number,
    options?: { status?: string; upcoming?: boolean }
  ): Promise<schema.Booking[]> {
    const conditions = [
      eq(schema.bookings.customerPhone, customerPhone),
      eq(schema.bookings.userId, userId),
    ];

    if (options?.status) {
      conditions.push(eq(schema.bookings.status, options.status as any));
    }

    if (options?.upcoming) {
      const today = new Date().toISOString().split('T')[0];
      conditions.push(sql`COALESCE(${schema.bookings.endDate}, ${schema.bookings.slotDate}) >= ${today}`);
      conditions.push(sql`${schema.bookings.status} NOT IN ('cancelled', 'completed', 'no_show')`);
    }

    return await db
      .select()
      .from(schema.bookings)
      .where(and(...conditions))
      .orderBy(schema.bookings.slotDate, schema.bookings.startTime)
      .limit(10); // Limit for fast response
  }

  async getBooking(id: number): Promise<schema.Booking | undefined> {
    const [booking] = await db
      .select()
      .from(schema.bookings)
      .where(eq(schema.bookings.id, id));
    return booking || undefined;
  }

  async createBooking(booking: schema.InsertBooking): Promise<schema.Booking> {
    const [newBooking] = await db
      .insert(schema.bookings)
      .values(booking)
      .returning();
    return newBooking;
  }

  async updateBooking(id: number, data: Partial<schema.Booking>): Promise<schema.Booking | undefined> {
    const [updated] = await db
      .update(schema.bookings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.bookings.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteBooking(id: number): Promise<void> {
    await db.delete(schema.bookings).where(eq(schema.bookings.id, id));
  }

  // OPTIMIZED: Single query to check slot availability (critical path for chatbot response).
  // Uses overlap-based matching (start < end AND end > start) with BLOCKING_BOOKING_STATUSES,
  // the same rule as checkBookingOverlap and the manual booking endpoint.
  // Kept as a separate method because it also resolves capacity from the staff's slot config
  // and supports excludeBookingId / userId scoping for the chatbot and reschedule flows.
  async checkSlotAvailability(
    staffId: number,
    slotDate: string,
    startTime: string,
    endTime: string,
    excludeBookingId?: number,
    userId?: number
  ): Promise<{ available: boolean; existingCount: number; capacity: number }> {
    // Get staff slot configuration for capacity
    const today = new Date(slotDate);
    const dayOfWeek = today.getDay();

    const [slotConfig] = await db
      .select()
      .from(schema.bookingStaffSlots)
      .where(
        and(
          eq(schema.bookingStaffSlots.staffId, staffId),
          eq(schema.bookingStaffSlots.dayOfWeek, dayOfWeek),
          eq(schema.bookingStaffSlots.isActive, true),
          sql`${schema.bookingStaffSlots.startTime} <= ${startTime}`,
          sql`${schema.bookingStaffSlots.endTime} > ${startTime}`
        )
      )
      .limit(1);

    if (!slotConfig) {
      return { available: false, existingCount: 0, capacity: 0 };
    }

    // Count existing bookings for this slot (multi-day aware: a booking whose
    // [slotDate, endDate] span covers this single date occupies it; the last day
    // of a multi-day booking uses its own window).
    const conditions = [
      eq(schema.bookings.staffId, staffId),
      bookingDaySpanOverlaps(slotDate, slotDate),
      inArray(schema.bookings.status, BLOCKING_BOOKING_STATUSES as any),
    ];

    if (excludeBookingId) {
      conditions.push(sql`${schema.bookings.id} != ${excludeBookingId}`);
    }

    if (userId !== undefined) {
      conditions.push(eq(schema.bookings.userId, userId));
    }

    const existing = await db
      .select({
        slotDate: schema.bookings.slotDate,
        endDate: schema.bookings.endDate,
        startTime: schema.bookings.startTime,
        endTime: schema.bookings.endTime,
        endDayStartTime: schema.bookings.endDayStartTime,
        endDayEndTime: schema.bookings.endDayEndTime,
      })
      .from(schema.bookings)
      .where(and(...conditions));

    const existingCount = countConflicts(
      { slotDate, endDate: null, startTime, endTime, endDayStartTime: null, endDayEndTime: null },
      existing
    );
    const capacity = slotConfig.capacity;

    return {
      available: existingCount < capacity,
      existingCount,
      capacity,
    };
  }

  async getBulkBookingCounts(
    staffId: number,
    dateRange: { startDate: string; endDate: string },
    userId?: number
  ): Promise<Map<string, number>> {
    const conditions = [
      eq(schema.bookings.staffId, staffId),
      bookingDaySpanOverlaps(dateRange.startDate, dateRange.endDate),
      sql`${schema.bookings.status} NOT IN ('cancelled')`,
    ];
    if (userId !== undefined) {
      conditions.push(eq(schema.bookings.userId, userId));
    }
    const results = await db
      .select({
        slotDate: schema.bookings.slotDate,
        startTime: schema.bookings.startTime,
        endTime: schema.bookings.endTime,
        endDate: schema.bookings.endDate,
        endDayStartTime: schema.bookings.endDayStartTime,
        endDayEndTime: schema.bookings.endDayEndTime,
      })
      .from(schema.bookings)
      .where(and(...conditions));

    // Expand multi-day bookings across their day span (clamped to the requested
    // range) so each occupied day contributes to the per-(date,startTime) count.
    // The last day's window uses its own start time.
    const countMap = new Map<string, number>();
    for (const row of results) {
      const spanEnd = row.endDate ?? row.slotDate;
      for (const d of eachDateInRange(row.slotDate, spanEnd)) {
        if (d < dateRange.startDate || d > dateRange.endDate) continue;
        const [ws] = occupiedWindowForDate(row, d);
        const key = `${d}_${ws}`;
        countMap.set(key, (countMap.get(key) || 0) + 1);
      }
    }
    return countMap;
  }

  // Count active bookings for a customer (for duplicate prevention)
  async countActiveBookingsForCustomer(
    customerPhone: string,
    userId: number,
    nodeId?: string
  ): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    
    const conditions = [
      eq(schema.bookings.customerPhone, customerPhone),
      eq(schema.bookings.userId, userId),
      sql`COALESCE(${schema.bookings.endDate}, ${schema.bookings.slotDate}) >= ${today}`,
      sql`${schema.bookings.status} NOT IN ('cancelled', 'completed', 'no_show')`,
    ];

    if (nodeId) {
      conditions.push(eq(schema.bookings.nodeId, nodeId));
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.bookings)
      .where(and(...conditions));

    return result?.count || 0;
  }

  // Get confirmed bookings that need reminders sent
  async getBookingsNeedingReminders(): Promise<schema.Booking[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const results = await db
      .select()
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.status, 'confirmed'),
          eq(schema.bookings.reminderEnabled, true),
          eq(schema.bookings.reminderSent, false),
          sql`${schema.bookings.slotDate} >= ${today}`
        )
      );
    
    return results;
  }

  // Mark a booking's reminder as sent
  async markBookingReminderSent(bookingId: number): Promise<void> {
    await db
      .update(schema.bookings)
      .set({ 
        reminderSent: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.bookings.id, bookingId));
  }

  // User Booking Settings
  async getUserBookingSettings(userId: number): Promise<schema.UserBookingSettings | undefined> {
    const [settings] = await db
      .select()
      .from(schema.userBookingSettings)
      .where(eq(schema.userBookingSettings.userId, userId));
    return settings || undefined;
  }

  async updateUserBookingSettings(userId: number, settings: Partial<{
    confirmMessage: string | null;
    rescheduleMessage: string | null;
    cancelMessage: string | null;
    customDayNames: string[] | null;
  }>): Promise<schema.UserBookingSettings> {
    // Check if settings exist for this user
    const existing = await this.getUserBookingSettings(userId);
    
    if (existing) {
      // Update existing settings
      const [updated] = await db
        .update(schema.userBookingSettings)
        .set({
          ...settings,
          updatedAt: new Date(),
        })
        .where(eq(schema.userBookingSettings.userId, userId))
        .returning();
      return updated;
    } else {
      // Create new settings
      const [created] = await db
        .insert(schema.userBookingSettings)
        .values({
          userId,
          ...settings,
        })
        .returning();
      return created;
    }
  }

  // Calendar view: all active slots for a user's staff, enriched with staff + department names
  async getBookingStaffSlotsForUser(userId: number, filters?: { departmentId?: number; staffId?: number }): Promise<CalendarSlot[]> {
    const conditions = [
      eq(schema.bookingStaff.userId, userId),
      eq(schema.bookingStaffSlots.isActive, true),
      eq(schema.bookingStaff.isActive, true),
    ];
    if (filters?.departmentId !== undefined) {
      conditions.push(eq(schema.bookingStaff.departmentId, filters.departmentId));
    }
    if (filters?.staffId !== undefined) {
      conditions.push(eq(schema.bookingStaff.id, filters.staffId));
    }

    return await db
      .select({
        id: schema.bookingStaffSlots.id,
        staffId: schema.bookingStaffSlots.staffId,
        dayOfWeek: schema.bookingStaffSlots.dayOfWeek,
        startTime: schema.bookingStaffSlots.startTime,
        endTime: schema.bookingStaffSlots.endTime,
        slotDuration: schema.bookingStaffSlots.slotDuration,
        capacity: schema.bookingStaffSlots.capacity,
        staffName: schema.bookingStaff.name,
        departmentId: schema.bookingStaff.departmentId,
        departmentName: schema.bookingDepartments.name,
      })
      .from(schema.bookingStaffSlots)
      .innerJoin(schema.bookingStaff, eq(schema.bookingStaffSlots.staffId, schema.bookingStaff.id))
      .innerJoin(schema.bookingDepartments, eq(schema.bookingStaff.departmentId, schema.bookingDepartments.id))
      .where(and(...conditions))
      .orderBy(schema.bookingStaffSlots.dayOfWeek, schema.bookingStaffSlots.startTime, schema.bookingStaff.id);
  }

  // Calendar view: bookings in a date range, enriched with staff + department names.
  // Defaults to non-cancelled; pass an exact status to override.
  async getBookingsForCalendar(userId: number, filters: {
    from: string;
    to: string;
    departmentId?: number;
    staffId?: number;
    status?: string;
  }): Promise<CalendarBooking[]> {
    const conditions = [
      eq(schema.bookings.userId, userId),
      bookingDaySpanOverlaps(filters.from, filters.to),
    ];

    if (filters.status) {
      conditions.push(eq(schema.bookings.status, filters.status as any));
    } else {
      conditions.push(inArray(schema.bookings.status, BLOCKING_BOOKING_STATUSES as any));
    }

    if (filters.departmentId !== undefined) {
      conditions.push(eq(schema.bookings.departmentId, filters.departmentId));
    }
    if (filters.staffId !== undefined) {
      conditions.push(eq(schema.bookings.staffId, filters.staffId));
    }

    return await db
      .select({
        id: schema.bookings.id,
        slotDate: schema.bookings.slotDate,
        endDate: schema.bookings.endDate,
        startTime: schema.bookings.startTime,
        endTime: schema.bookings.endTime,
        endDayStartTime: schema.bookings.endDayStartTime,
        endDayEndTime: schema.bookings.endDayEndTime,
        departmentId: schema.bookings.departmentId,
        departmentName: schema.bookingDepartments.name,
        staffId: schema.bookings.staffId,
        staffName: schema.bookingStaff.name,
        customerName: schema.bookings.customerName,
        customerPhone: schema.bookings.customerPhone,
        status: schema.bookings.status,
        bookingLabel: schema.bookings.bookingLabel,
        customField1Label: schema.bookings.customField1Label,
        customField1Value: schema.bookings.customField1Value,
        customField2Label: schema.bookings.customField2Label,
        customField2Value: schema.bookings.customField2Value,
      })
      .from(schema.bookings)
      .innerJoin(schema.bookingStaff, eq(schema.bookings.staffId, schema.bookingStaff.id))
      .innerJoin(schema.bookingDepartments, eq(schema.bookings.departmentId, schema.bookingDepartments.id))
      .where(and(...conditions))
      .orderBy(schema.bookings.slotDate, schema.bookings.startTime, schema.bookings.staffId);
  }

  // Booking Custom Fields (user-defined)
  async getBookingCustomFieldsForUser(userId: number): Promise<schema.BookingCustomField[]> {
    return await db
      .select()
      .from(schema.bookingCustomFields)
      .where(and(
        eq(schema.bookingCustomFields.userId, userId),
        eq(schema.bookingCustomFields.isActive, true),
      ))
      .orderBy(schema.bookingCustomFields.displayOrder, schema.bookingCustomFields.id);
  }

  async getBookingCustomField(id: number): Promise<schema.BookingCustomField | undefined> {
    const [field] = await db
      .select()
      .from(schema.bookingCustomFields)
      .where(eq(schema.bookingCustomFields.id, id));
    return field || undefined;
  }

  async createBookingCustomField(data: schema.InsertBookingCustomField): Promise<schema.BookingCustomField> {
    const [field] = await db
      .insert(schema.bookingCustomFields)
      .values(data)
      .returning();
    return field;
  }

  async updateBookingCustomField(id: number, data: Partial<schema.BookingCustomField>): Promise<schema.BookingCustomField | undefined> {
    const [updated] = await db
      .update(schema.bookingCustomFields)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.bookingCustomFields.id, id))
      .returning();
    return updated || undefined;
  }

  async softDeleteBookingCustomField(id: number): Promise<void> {
    await db
      .update(schema.bookingCustomFields)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.bookingCustomFields.id, id));
  }

  async reorderBookingCustomFields(userId: number, ids: number[]): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      await db
        .update(schema.bookingCustomFields)
        .set({ displayOrder: i, updatedAt: new Date() })
        .where(and(
          eq(schema.bookingCustomFields.id, ids[i]),
          eq(schema.bookingCustomFields.userId, userId),
        ));
    }
  }

  async countActiveBookingCustomFields(userId: number): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.bookingCustomFields)
      .where(and(
        eq(schema.bookingCustomFields.userId, userId),
        eq(schema.bookingCustomFields.isActive, true),
      ));
    return result?.count || 0;
  }

  // Overlap-based availability check (used by the manual booking endpoint).
  // Blocks any time-range overlap with a confirmed/completed booking. Time
  // comparison is done per-day in JS so multi-day bookings' last-day windows are
  // handled correctly.
  async checkBookingOverlap(
    staffId: number,
    slotDate: string,
    startTime: string,
    endTime: string,
    userId: number,
    excludeBookingId?: number,
    endDate?: string,
    endDayStartTime?: string,
    endDayEndTime?: string
  ): Promise<{ available: boolean; conflictingCount: number }> {
    const rangeEnd = endDate ?? slotDate;
    const conditions = [
      eq(schema.bookings.staffId, staffId),
      bookingDaySpanOverlaps(slotDate, rangeEnd),
      inArray(schema.bookings.status, BLOCKING_BOOKING_STATUSES as any),
      eq(schema.bookings.userId, userId),
    ];
    if (excludeBookingId !== undefined) {
      conditions.push(sql`${schema.bookings.id} != ${excludeBookingId}`);
    }
    const existing = await db
      .select({
        slotDate: schema.bookings.slotDate,
        endDate: schema.bookings.endDate,
        startTime: schema.bookings.startTime,
        endTime: schema.bookings.endTime,
        endDayStartTime: schema.bookings.endDayStartTime,
        endDayEndTime: schema.bookings.endDayEndTime,
      })
      .from(schema.bookings)
      .where(and(...conditions));

    const proposed: OccupiedWindowSource = {
      slotDate,
      endDate: rangeEnd === slotDate ? null : rangeEnd,
      startTime,
      endTime,
      endDayStartTime: endDayStartTime ?? null,
      endDayEndTime: endDayEndTime ?? null,
    };
    const c = countConflicts(proposed, existing);
    return { available: c === 0, conflictingCount: c };
  }

  // Atomically create a manual booking + its custom field values. Takes an advisory
  // lock keyed on (staff, date) to serialize double-booking, re-checks overlap inside
  // the transaction, then inserts the booking and its values.
  async createManualBookingWithValues(
    booking: schema.InsertBooking,
    values: { fieldId: number; value: string }[]
  ): Promise<{ booking: schema.Booking; values: schema.BookingCustomFieldValue[] }> {
    return await db.transaction(async (tx) => {
      // Lock every day in the range (sorted) to serialize against overlapping
      // multi-day bookings across any of their occupied dates.
      const lockRangeEnd = booking.endDate ?? booking.slotDate;
      for (const d of eachDateInRange(booking.slotDate, lockRangeEnd).sort()) {
        const lockKey = `booking:${booking.staffId}:${d}`;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      }

      const existing = await tx
        .select({
          slotDate: schema.bookings.slotDate,
          endDate: schema.bookings.endDate,
          startTime: schema.bookings.startTime,
          endTime: schema.bookings.endTime,
          endDayStartTime: schema.bookings.endDayStartTime,
          endDayEndTime: schema.bookings.endDayEndTime,
        })
        .from(schema.bookings)
        .where(and(
          eq(schema.bookings.staffId, booking.staffId),
          bookingDaySpanOverlaps(booking.slotDate, lockRangeEnd),
          inArray(schema.bookings.status, BLOCKING_BOOKING_STATUSES as any),
          eq(schema.bookings.userId, booking.userId),
        ));

      const proposed: OccupiedWindowSource = {
        slotDate: booking.slotDate,
        endDate: booking.endDate ?? null,
        startTime: booking.startTime,
        endTime: booking.endTime,
        endDayStartTime: booking.endDayStartTime ?? null,
        endDayEndTime: booking.endDayEndTime ?? null,
      };
      if (countConflicts(proposed, existing) > 0) {
        throw new BookingSlotUnavailableError();
      }

      const [newBooking] = await tx.insert(schema.bookings).values(booking).returning();

      let insertedValues: schema.BookingCustomFieldValue[] = [];
      if (values.length > 0) {
        insertedValues = await tx
          .insert(schema.bookingCustomFieldValues)
          .values(values.map((v) => ({ bookingId: newBooking.id, fieldId: v.fieldId, value: v.value })))
          .returning();
      }

      return { booking: newBooking, values: insertedValues };
    });
  }

  async getBookingCustomFieldValues(bookingId: number): Promise<schema.BookingCustomFieldValue[]> {
    return await db
      .select()
      .from(schema.bookingCustomFieldValues)
      .where(eq(schema.bookingCustomFieldValues.bookingId, bookingId));
  }

  async getBookingCustomFieldValuesForBookings(bookingIds: number[]): Promise<schema.BookingCustomFieldValue[]> {
    if (bookingIds.length === 0) return [];
    return await db
      .select()
      .from(schema.bookingCustomFieldValues)
      .where(inArray(schema.bookingCustomFieldValues.bookingId, bookingIds));
  }

  async setBookingCustomFieldValues(bookingId: number, values: { fieldId: number; value: string }[]): Promise<void> {
    return await db.transaction(async (tx) => {
      await tx.delete(schema.bookingCustomFieldValues).where(eq(schema.bookingCustomFieldValues.bookingId, bookingId));
      if (values.length > 0) {
        await tx.insert(schema.bookingCustomFieldValues)
          .values(values.map((v) => ({ bookingId, fieldId: v.fieldId, value: v.value })));
      }
    });
  }

  // Merge (not replace) custom field values for a booking: upsert each incoming
  // { fieldId, value }, leaving unmentioned fields untouched. Empty values delete
  // the row (matches the owner edit's delete-on-empty semantics). Used by the
  // public share PATCH, which sends only the changed fields.
  async mergeBookingCustomFieldValues(
    bookingId: number,
    updates: { fieldId: number; value: string }[],
  ): Promise<void> {
    const existing = await this.getBookingCustomFieldValues(bookingId);
    const map = new Map(existing.map((v) => [v.fieldId, v.value]));
    for (const u of updates) {
      if (u.value === "") {
        map.delete(u.fieldId); // delete-on-empty
      } else {
        map.set(u.fieldId, u.value);
      }
    }
    const merged = Array.from(map, ([fieldId, value]) => ({ fieldId, value }));
    await this.setBookingCustomFieldValues(bookingId, merged);
  }

  // Booking share links (Feature 3)

  async createShareLink(data: {
    userId: number;
    slot: number;
    tokenHash: string;
    passwordHash: string;
    description?: string | null;
    config: schema.ShareLinkConfig;
    configVersion?: number;
    isEnabled?: boolean;
    expiresAt?: Date | null;
    tokenCreatedAt?: Date | null;
  }): Promise<schema.BookingShareLink> {
    const [link] = await db.insert(schema.bookingShareLinks).values({
      userId: data.userId,
      slot: data.slot,
      tokenHash: data.tokenHash,
      passwordHash: data.passwordHash,
      description: data.description ?? null,
      config: data.config,
      configVersion: data.configVersion ?? 1,
      isEnabled: data.isEnabled ?? true,
      expiresAt: data.expiresAt ?? null,
      tokenCreatedAt: data.tokenCreatedAt ?? null,
    }).returning();
    return link;
  }

  async listShareLinks(userId: number): Promise<schema.BookingShareLink[]> {
    return await db.select()
      .from(schema.bookingShareLinks)
      .where(eq(schema.bookingShareLinks.userId, userId))
      .orderBy(asc(schema.bookingShareLinks.id));
  }

  async getShareLink(id: number): Promise<schema.BookingShareLink | undefined> {
    const [link] = await db.select().from(schema.bookingShareLinks).where(eq(schema.bookingShareLinks.id, id));
    return link || undefined;
  }

  async getShareLinkByTokenHash(tokenHash: string): Promise<schema.BookingShareLink | undefined> {
    const [link] = await db.select().from(schema.bookingShareLinks).where(eq(schema.bookingShareLinks.tokenHash, tokenHash));
    return link || undefined;
  }

  async updateShareLink(id: number, data: Partial<schema.BookingShareLink>): Promise<schema.BookingShareLink | undefined> {
    // Defense-in-depth: strip identity/ownership fields so no caller can change
    // the row's id, owner, slot, or creation time via update. tokenHash and
    // tokenCreatedAt remain — they are the legitimate fields for regenerate.
    const { id: _id, userId: _userId, slot: _slot, createdAt: _createdAt, ...safe } = data;
    const [link] = await db.update(schema.bookingShareLinks)
      .set({ ...safe, updatedAt: new Date() })
      .where(eq(schema.bookingShareLinks.id, id))
      .returning();
    return link;
  }

  async toggleShareLink(id: number): Promise<schema.BookingShareLink | undefined> {
    const [existing] = await db.select().from(schema.bookingShareLinks).where(eq(schema.bookingShareLinks.id, id));
    if (!existing) return undefined;
    const [link] = await db.update(schema.bookingShareLinks)
      .set({ isEnabled: !existing.isEnabled, updatedAt: new Date() })
      .where(eq(schema.bookingShareLinks.id, id))
      .returning();
    return link;
  }

  async deleteShareLink(id: number): Promise<void> {
    await db.delete(schema.bookingShareLinks).where(eq(schema.bookingShareLinks.id, id));
  }

  async countShareLinks(userId: number): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.bookingShareLinks)
      .where(eq(schema.bookingShareLinks.userId, userId));
    return result?.count || 0;
  }

  // Web chat links (Phase 4A-3a-1)

  async getWebChatLinkForWorkflow(workflowId: number): Promise<schema.WebChatLink | null> {
    const [link] = await db.select()
      .from(schema.webChatLinks)
      .where(eq(schema.webChatLinks.workflowId, workflowId));
    return link || null;
  }

  async getWebChatLinkByTokenHash(tokenHash: string): Promise<schema.WebChatLink | null> {
    const [link] = await db.select()
      .from(schema.webChatLinks)
      .where(eq(schema.webChatLinks.tokenHash, tokenHash));
    return link || null;
  }

  async getWebChatLink(id: number): Promise<schema.WebChatLink | null> {
    const [link] = await db.select()
      .from(schema.webChatLinks)
      .where(eq(schema.webChatLinks.id, id));
    return link || null;
  }

  async createWebChatLink(data: {
    userId: number;
    workflowId: number;
    tokenHash: string;
    label?: string | null;
    expiresAt?: Date | null;
  }): Promise<schema.WebChatLink> {
    const [link] = await db.insert(schema.webChatLinks).values({
      userId: data.userId,
      workflowId: data.workflowId,
      tokenHash: data.tokenHash,
      label: data.label ?? null,
      isEnabled: false, // owner must explicitly enable the link
      expiresAt: data.expiresAt ?? null,
    }).returning();
    return link;
  }

  async updateWebChatLink(id: number, data: Partial<schema.WebChatLink>): Promise<schema.WebChatLink | null> {
    // Defense-in-depth: identity/ownership/creation fields are not updatable.
    // tokenHash is intentionally kept — rotate legitimately replaces it.
    const { id: _id, userId: _userId, workflowId: _workflowId, createdAt: _createdAt, ...safe } = data;
    const [link] = await db.update(schema.webChatLinks)
      .set({ ...safe, updatedAt: new Date() })
      .where(eq(schema.webChatLinks.id, id))
      .returning();
    return link || null;
  }

  async deleteWebChatLink(id: number): Promise<void> {
    await db.delete(schema.webChatLinks).where(eq(schema.webChatLinks.id, id));
  }

  // Session count + last message time for the owner-facing metadata. Link-scoped
  // (all sessions belonging to the link), which is equivalent to workflow-scoped
  // while the one-link-per-workflow rule holds.
  async getWebChatLinkStats(linkId: number): Promise<{ sessionCount: number; lastMessageAt: Date | null }> {
    const [sessionAgg] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.webChatSessions)
      .where(eq(schema.webChatSessions.linkId, linkId));

    const [messageAgg] = await db
      .select({ lastMessageAt: sql<string | Date | null>`max(${schema.webChatMessages.createdAt})` })
      .from(schema.webChatMessages)
      .innerJoin(schema.webChatSessions, eq(schema.webChatMessages.sessionId, schema.webChatSessions.id))
      .where(eq(schema.webChatSessions.linkId, linkId));

    const raw = messageAgg?.lastMessageAt ?? null;
    return {
      sessionCount: sessionAgg?.count || 0,
      lastMessageAt: raw ? (raw instanceof Date ? raw : new Date(raw)) : null,
    };
  }

  // Web chat sessions

  async getWebChatSession(id: number): Promise<schema.WebChatSession | null> {
    const [session] = await db.select()
      .from(schema.webChatSessions)
      .where(eq(schema.webChatSessions.id, id));
    return session || null;
  }

  async getWebChatSessionByKey(sessionKey: string): Promise<schema.WebChatSession | null> {
    const [session] = await db.select()
      .from(schema.webChatSessions)
      .where(eq(schema.webChatSessions.sessionKey, sessionKey));
    return session || null;
  }

  async createWebChatSession(data: {
    workflowId: number;
    linkId: number;
    sessionKey: string;
    ipHash?: string | null;
    userAgentHash?: string | null;
    status?: string;
  }): Promise<schema.WebChatSession> {
    const [session] = await db.insert(schema.webChatSessions).values({
      workflowId: data.workflowId,
      linkId: data.linkId,
      sessionKey: data.sessionKey,
      ipHash: data.ipHash ?? null,
      userAgentHash: data.userAgentHash ?? null,
      status: data.status ?? "active",
      lastSeenAt: new Date(),
    }).returning();
    return session;
  }

  async updateWebChatSession(id: number, data: Partial<schema.WebChatSession>): Promise<schema.WebChatSession | null> {
    // Identity/ownership/creation fields are not updatable here.
    const { id: _id, workflowId: _workflowId, linkId: _linkId, sessionKey: _sessionKey, startedAt: _startedAt, ...safe } = data;
    const [session] = await db.update(schema.webChatSessions)
      .set(safe)
      .where(eq(schema.webChatSessions.id, id))
      .returning();
    return session || null;
  }

  async endWebChatSession(id: number): Promise<schema.WebChatSession | null> {
    const [session] = await db.update(schema.webChatSessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(schema.webChatSessions.id, id))
      .returning();
    return session || null;
  }

  // Web chat messages

  async createWebChatMessage(data: {
    sessionId: number;
    workflowId: number;
    role: string;
    kind: string;
    nodeId?: string | null;
    payload?: Record<string, unknown>;
    clientMsgId?: string | null;
  }): Promise<schema.WebChatMessage> {
    const [message] = await db.insert(schema.webChatMessages).values({
      sessionId: data.sessionId,
      workflowId: data.workflowId,
      role: data.role,
      kind: data.kind,
      nodeId: data.nodeId ?? null,
      payload: data.payload ?? {},
      clientMsgId: data.clientMsgId ?? null,
    }).returning();
    return message;
  }

  async getWebChatMessagesSince(sessionId: number, sinceId: number, limit: number): Promise<schema.WebChatMessage[]> {
    return await db.select()
      .from(schema.webChatMessages)
      .where(and(
        eq(schema.webChatMessages.sessionId, sessionId),
        gt(schema.webChatMessages.id, sinceId),
      ))
      .orderBy(asc(schema.webChatMessages.id))
      .limit(Math.max(1, Math.min(limit || 50, 200)));
  }

  async getWebChatMessagesForSession(sessionId: number, limit: number): Promise<schema.WebChatMessage[]> {
    const rows = await db.select()
      .from(schema.webChatMessages)
      .where(eq(schema.webChatMessages.sessionId, sessionId))
      .orderBy(desc(schema.webChatMessages.id))
      .limit(Math.max(1, Math.min(limit || 50, 200)));
    return rows.reverse(); // newest-N selected, but returned oldest-first
  }

  // Phase 4A-3a-2 — idempotency replay. visitor rows carry the client key; the
  // unique index on (session_id, client_msg_id) is the authoritative guard.
  async getWebChatMessageByClientMsgId(
    sessionId: number,
    clientMsgId: string
  ): Promise<schema.WebChatMessage | null> {
    const [message] = await db.select()
      .from(schema.webChatMessages)
      .where(and(
        eq(schema.webChatMessages.sessionId, sessionId),
        eq(schema.webChatMessages.clientMsgId, clientMsgId),
      ));
    return message || null;
  }
}

export const storage = new DatabaseStorage();
