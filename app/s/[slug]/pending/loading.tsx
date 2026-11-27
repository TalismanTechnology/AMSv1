import { LogoLoading } from "@/components/logo-loading";
import { getTranslator } from "@/lib/i18n/server";

export default async function PendingLoading() {
  const { t } = await getTranslator();
  return <LogoLoading fullScreen label={t("auth.loading")} />;
}
