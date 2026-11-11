import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { MenuItem } from '../models/MenuItem.js';
import { determineItemType } from '../controllers/menuController.js';
import { connectDB, disconnectDB } from '../config/db.js';

export async function ensureDefaults() {
  try {
    // 1. Only bootstrap an initial admin if the database has zero users at all.
    // Never recreate deleted staff/demo accounts on restart.
    const userCount = await User.countDocuments();
    let adminCreated = false;
    if (userCount === 0) {
      const adminPasswordHash = await bcrypt.hash('admin123', 10);
      await User.create({
        name: 'System Administrator',
        username: 'admin',
        passwordHash: adminPasswordHash,
        role: 'admin',
        canManageInventory: true,
        isActive: true,
      });
      adminCreated = true;
      console.log('[Defaults] Bootstrapped initial admin account (username: "admin") for empty database.');
    }

    // 2. Backfill itemType only on legacy MenuItems that lack one (preserve explicit admin choices)
    const missingTypeItems = await MenuItem.find({
      $or: [{ itemType: { $exists: false } }, { itemType: null }, { itemType: '' }],
    });
    for (const item of missingTypeItems) {
      item.itemType = determineItemType(item);
      await item.save();
    }

    return { adminCreated };
  } catch (err) {
    console.error('[Defaults Error] Failed to ensure defaults:', err.message);
    throw err;
  }
}

// Allow standalone execution: `node src/utils/ensureDefaults.js`
if (process.argv[1] && process.argv[1].endsWith('ensureDefaults.js')) {
  (async () => {
    try {
      console.log('[Defaults] Connecting to database...');
      await connectDB();
      console.log('[Defaults] Connected. Ensuring defaults...');
      await ensureDefaults();
      console.log('[Defaults] Finished successfully.');
      await disconnectDB();
      process.exit(0);
    } catch (err) {
      console.error('[Defaults Fatal Error]:', err);
      await disconnectDB().catch(() => {});
      process.exit(1);
    }
  })();
}
