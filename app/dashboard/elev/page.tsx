import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import DashboardElev from "@/components/dashboard-elev"

export default async function ElevDashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, class_id")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "elev") {
    redirect("/")
  }

  // Get class info
  let classCode = "Neasignat"
  if (profile.class_id) {
    const { data: classInfo } = await supabase
      .from("classes")
      .select("code")
      .eq("id", profile.class_id)
      .single()
    
    if (classInfo) {
      classCode = classInfo.code
    }
  }

  return (
    <DashboardElev 
      userId={user.id}
      displayName={profile.display_name}
      classCode={classCode}
      classId={profile.class_id || undefined}
    />
  )
}
