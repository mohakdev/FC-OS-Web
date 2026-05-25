// TODO: Write common db actions here and query functions for roles and domains.

import { db } from "../database/db";
import { type NewProfile, profiles } from "../database/schemas/profiles";

export const pushProfiles = async (values: NewProfile[]) => {
  await db.insert(profiles).values(values);
  return db.select().from(profiles);
};
