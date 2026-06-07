import { redirect } from "next/navigation";

type DirectoryClientRedirectPageProps = {
  params: Promise<{
    clientId: string;
  }>;
};

export default async function DirectoryClientRedirectPage({
  params
}: DirectoryClientRedirectPageProps) {
  const { clientId } = await params;
  redirect(`/clients/${clientId}`);
}
