/** Compatibility barrel — prefer importing from @/lib/repo/* directly. */
export { readSettings, insertShopAndManager, updateSettings, listOperators, setOperatorName } from "@/lib/repo/settings";
export {
  findUserByUsername,
  findActiveUserById,
  listUsers,
  insertUser,
  updateUserRole,
  updateUserActive,
  updateUserPassword,
} from "@/lib/repo/users";
