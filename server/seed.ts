import { storage } from "./storage";
import { hashPassword } from "./auth";

export async function seedDatabase() {
  console.log("Seeding database...");

  // Check if admin already exists
  const existingAdmin = await storage.getUserByEmail("admin@omniplus.com");
  if (!existingAdmin) {
    // Create admin user
    const adminPassword = await hashPassword("admin123");
    await storage.createUser({
      name: "Admin User",
      email: "admin@omniplus.com",
      passwordHash: adminPassword,
      role: "admin",
      daysBalance: 999,
      status: "active",
    });
    console.log("✓ Admin user created (admin@omniplus.com / admin123)");
  }

  // Check if test user already exists
  const existingUser = await storage.getUserByEmail("user@omniplus.com");
  if (!existingUser) {
    // Create regular test user
    const userPassword = await hashPassword("password123");
    await storage.createUser({
      name: "Test User",
      email: "user@omniplus.com",
      passwordHash: userPassword,
      role: "user",
      daysBalance: 0,
      status: "active",
    });
    console.log("✓ Test user created (user@omniplus.com / password123)");
  }

  // Check if plans exist
  const existingPlans = await storage.getPlans();
  if (existingPlans.length === 0) {
    // Create sample plans
    await storage.createPlan({
      name: "Starter",
      price: 2900, // $29 in cents
      currency: "USD",
      durationDays: 30,
      channelsLimit: 1,
      dailyMessagesLimit: 100,
      bulkMessagesLimit: 500,
      features: ["Basic templates", "Email support"],
    });

    await storage.createPlan({
      name: "Growth",
      price: 7900, // $79 in cents
      currency: "USD",
      durationDays: 30,
      channelsLimit: 3,
      dailyMessagesLimit: 500,
      bulkMessagesLimit: 5000,
      features: ["Advanced templates", "Chatbot builder", "Priority support"],
    });

    await storage.createPlan({
      name: "Advanced",
      price: 19900, // $199 in cents
      currency: "USD",
      durationDays: 30,
      channelsLimit: 10,
      dailyMessagesLimit: 2000,
      bulkMessagesLimit: 50000,
      features: ["Custom workflows", "API access", "Dedicated support"],
    });

    await storage.createPlan({
      name: "Enterprise",
      price: 49900, // $499 in cents (custom pricing in reality)
      currency: "USD",
      durationDays: 30,
      channelsLimit: 999,
      dailyMessagesLimit: 999999,
      bulkMessagesLimit: 999999,
      features: [
        "Custom integrations",
        "SLA guarantee",
        "Account manager",
        "White-label option",
      ],
    });

    console.log("✓ Sample plans created");
  }

  // Initialize main admin balance if not exists
  const mainBalanceSetting = await storage.getSetting("main_days_balance");
  if (!mainBalanceSetting) {
    await storage.setSetting("main_days_balance", "1000");
    console.log("✓ Main admin balance initialized (1000 days)");
  }

  // Check if terms documents exist
  const existingTerms = await storage.getActiveTermsDocuments();
  if (existingTerms.length === 0) {
    // Create Button Functionality Terms
    await storage.createTermsDocument({
      type: "BUTTON_FUNCTIONALITY",
      version: "1.0",
      title: "OMNI PLUS – Terms of Use for Button Functionality on WhatsApp API",
      content: `OMNI PLUS – Terms of Use for Button Functionality on WhatsApp API

Last Updated: November 2025

By activating the button functionality in WhatsApp through OMNI PLUS, you agree to the terms outlined in this document.

1. Functionality Description

The endpoint for sending interactive button messages via OMNI PLUS API is used to send messages with buttons that allow users to engage, reply, or open URLs within WhatsApp.

2. Disclaimer

OMNI PLUS is not responsible for any changes, suspension, or removal of button features by Meta Platforms Inc. Meta may modify or discontinue such functionality at any time without prior notice.

3. Risk Notice

Users acknowledge that Meta may, at its discretion, modify, limit, or terminate button features without notice. OMNI PLUS assumes no liability for resulting data interruptions or business losses.

4. Limitation of Liability

OMNI PLUS shall not be liable for direct, indirect, incidental, or consequential damages arising from the use or inability to use button functionalities, including but not limited to business disruptions or data loss.

5. User Responsibility

Users are solely responsible for the content and compliance of messages sent using button features. OMNI PLUS does not monitor, control, or assume liability for user-generated content.

6. Amendments

OMNI PLUS reserves the right to update these terms at any time. Continued use of button functionality constitutes acceptance of revised terms.

For questions, contact: support@omniplus.ai`,
      isActive: true,
    });

    // Create PayPal Payment Terms
    await storage.createTermsDocument({
      type: "PAYPAL_PAYMENT",
      version: "1.0",
      title: "Payment Terms & Conditions",
      content: `Payment Terms & Conditions

By subscribing to OMNI PLUS services via PayPal, you agree to the following terms:

1. Payment Processing
All payments are processed securely through PayPal. OMNI PLUS does not store your payment information.

2. Subscription Billing
Subscriptions are billed on a recurring basis according to your selected plan duration (monthly, quarterly, semi-annual, or annual).

3. Refund Policy
Refunds are handled on a case-by-case basis. Please contact support@omniplus.ai for refund requests.

4. Service Availability
OMNI PLUS reserves the right to modify service features and pricing with advance notice to subscribers.

5. Cancellation
You may cancel your subscription at any time through your account settings. Access continues until the end of your billing period.`,
      isActive: true,
    });

    console.log("✓ Terms & Conditions documents created");
  }

  // Create sample hospital booking data for testing
  const admin = await storage.getUserByEmail("admin@omniplus.com");
  if (admin) {
    const existingDepts = await storage.getBookingDepartmentsForUser(admin.id);
    if (existingDepts.length === 0) {
      // Create hospital departments
      const generalDept = await storage.createBookingDepartment({
        userId: admin.id,
        name: "General Medicine",
        description: "General health checkups and consultations",
        isActive: true,
      });
      
      const cardioDept = await storage.createBookingDepartment({
        userId: admin.id,
        name: "Cardiology",
        description: "Heart and cardiovascular health",
        isActive: true,
      });
      
      // Create staff members
      const drSmith = await storage.createBookingStaff({
        userId: admin.id,
        departmentId: generalDept.id,
        name: "Dr. Sarah Smith",
        specialty: "General Practitioner",
        isActive: true,
      });
      
      const drJones = await storage.createBookingStaff({
        userId: admin.id,
        departmentId: cardioDept.id,
        name: "Dr. Michael Jones",
        specialty: "Cardiologist",
        isActive: true,
      });
      
      // Create time slots (Monday to Friday, 9 AM - 5 PM)
      const timeSlots = [
        { startTime: "09:00", endTime: "10:00" },
        { startTime: "10:00", endTime: "11:00" },
        { startTime: "11:00", endTime: "12:00" },
        { startTime: "14:00", endTime: "15:00" },
        { startTime: "15:00", endTime: "16:00" },
        { startTime: "16:00", endTime: "17:00" },
      ];
      
      // Add slots for Dr. Smith (Mon-Fri)
      for (let day = 1; day <= 5; day++) {
        for (const slot of timeSlots) {
          await storage.createBookingStaffSlot({
            staffId: drSmith.id,
            dayOfWeek: day,
            startTime: slot.startTime,
            endTime: slot.endTime,
            maxBookings: 2,
            isActive: true,
          });
        }
      }
      
      // Add slots for Dr. Jones (Mon, Wed, Fri)
      for (const day of [1, 3, 5]) {
        for (const slot of timeSlots.slice(0, 3)) {
          await storage.createBookingStaffSlot({
            staffId: drJones.id,
            dayOfWeek: day,
            startTime: slot.startTime,
            endTime: slot.endTime,
            maxBookings: 1,
            isActive: true,
          });
        }
      }
      
      console.log("✓ Hospital booking departments, staff, and slots created");
      
      // Create a sample booking workflow
      const workflowDefinition = {
        nodes: [
          {
            id: "entry_1",
            type: "entry",
            position: { x: 250, y: 50 },
            data: {
              label: "Book Appointment",
              type: "entry",
              config: { keyword: "book" }
            }
          },
          {
            id: "message_1",
            type: "message",
            position: { x: 250, y: 150 },
            data: {
              label: "Welcome Message",
              type: "message",
              config: {
                messageType: "text",
                text: "Welcome to City Hospital! 🏥\n\nI'll help you book an appointment with one of our specialists."
              }
            }
          },
          {
            id: "booking_1",
            type: "booking.book_appointment",
            position: { x: 250, y: 280 },
            data: {
              label: "Book Appointment",
              type: "booking.book_appointment",
              config: {
                promptMessage: "Please select a department to book your appointment:",
                successMessage: "Great! Your appointment is confirmed for {{date}} at {{time}} with {{staff}} in {{department}}.",
                noSlotsMessage: "Sorry, no available slots at the moment. Please try again later.",
                allowMultiple: false,
                maxAdvanceDays: 14,
                bookingLabel: "Hospital Appointment"
              }
            }
          },
          {
            id: "success_msg",
            type: "message",
            position: { x: 100, y: 450 },
            data: {
              label: "Booking Confirmed",
              type: "message",
              config: {
                messageType: "text",
                text: "Thank you for booking with City Hospital! We look forward to seeing you.\n\nPlease arrive 15 minutes before your appointment time."
              }
            }
          },
          {
            id: "no_slots_msg",
            type: "message",
            position: { x: 400, y: 450 },
            data: {
              label: "No Slots Available",
              type: "message",
              config: {
                messageType: "text",
                text: "We apologize for the inconvenience. Please try booking again later or call us at (555) 123-4567."
              }
            }
          }
        ],
        edges: [
          { id: "e1", source: "entry_1", target: "message_1", sourceHandle: "default", targetHandle: null },
          { id: "e2", source: "message_1", target: "booking_1", sourceHandle: "default", targetHandle: null },
          { id: "e3", source: "booking_1", target: "success_msg", sourceHandle: "booked", targetHandle: null },
          { id: "e4", source: "booking_1", target: "no_slots_msg", sourceHandle: "no_slots", targetHandle: null }
        ]
      };
      
      await storage.createWorkflow({
        userId: admin.id,
        name: "Hospital Appointment Booking",
        definitionJson: workflowDefinition,
        entryNodeId: "entry_1",
        isActive: true,
      });
      
      console.log("✓ Hospital booking workflow created (trigger: 'book')");
    }
  }

  console.log("Database seeded successfully!");
}
