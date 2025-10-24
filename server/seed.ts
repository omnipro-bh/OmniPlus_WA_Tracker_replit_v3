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
        "Unlimited channels",
        "Unlimited messages",
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

  console.log("Database seeded successfully!");
}
