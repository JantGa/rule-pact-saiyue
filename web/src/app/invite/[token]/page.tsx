import { InviteView } from "@/components/invite-view";
import { SiteHeader } from "@/components/site-header";

export default async function InvitePage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <>
      <SiteHeader />
      <InviteView token={token} />
    </>
  );
}

