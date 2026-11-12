import { redirect } from "next/navigation";
export default function Home() {
  redirect(process.env.PUBLIC_DEMO_ENABLED === "true" ? "/demo" : "/dashboard");
}
