import { useEffect } from "react";
import { useRoute } from "wouter";
import IndustryPage from "@/components/industry/industry-page";
import NotFound from "@/pages/not-found";
import { getIndustry } from "@/data/industries";

/**
 * Route entry for /industry/:slug.
 *
 * Unknown slugs render the existing 404 page rather than an empty shell.
 * Document title is set here because the app has no head/helmet layer.
 */
export default function IndustryRoute() {
  const [, params] = useRoute("/industry/:slug");
  const config = getIndustry(params?.slug);

  useEffect(() => {
    if (!config) return;
    const previous = document.title;
    document.title = config.metaTitle;
    return () => {
      document.title = previous;
    };
  }, [config]);

  if (!config) return <NotFound />;

  return <IndustryPage config={config} />;
}
