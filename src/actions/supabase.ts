import { createClient } from "@/utils/supabase/client";

export const signInUser = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  return {
    data,
    error: error?.message ?? null,
  }
};
