import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import DashboardProfesor from "@/components/dashboard-profesor"

export default async function ProfesorDashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "profesor") {
    redirect("/")
  }

  // Get all classes for the professor
  const { data: classes } = await supabase
    .from("classes")
    .select("id, code")
    .order("code")

  return (
    <DashboardProfesor 
      userId={user.id}
      displayName={profile.display_name}
      classes={classes || []}
    />
  )
}
