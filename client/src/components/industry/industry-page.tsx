import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { HeroSection } from "@/components/industry/hero-section";
import { PainPointsSection } from "@/components/industry/pain-points";
import { DemoSection } from "@/components/industry/demo-section";
import { DepartmentFeaturesSection } from "@/components/industry/department-features";
import { HowItWorksSection } from "@/components/industry/how-it-works";
import { RoiStatsSection } from "@/components/industry/roi-stats";
import { ComplianceSection } from "@/components/industry/compliance";
import { CaseStudySection } from "@/components/industry/case-study";
import { FinalCtaSection } from "@/components/industry/final-cta";
import type { IndustryConfig } from "@/data/industries";

/**
 * Renders an industry landing page from configuration only.
 *
 * This component must never contain industry-specific prose: every string it
 * shows is read from `config`. Adding ecommerce or automotive means adding an
 * entry to `client/src/data/industries.ts` and nothing here.
 */
export default function IndustryPage({ config }: { config: IndustryConfig }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav showPricing={false} />

      <main>
        <HeroSection config={config} />
        <PainPointsSection copy={config.sectionCopy.painPoints} painPoints={config.painPoints} />
        <DemoSection
          copy={config.sectionCopy.demo}
          demo={config.demo}
          slug={config.slug}
        />
        <DepartmentFeaturesSection
          copy={config.sectionCopy.capabilities}
          featureGroups={config.featureGroups}
        />
        <HowItWorksSection copy={config.sectionCopy.howItWorks} steps={config.howItWorks} />
        <RoiStatsSection copy={config.sectionCopy.results} stats={config.stats} />
        <ComplianceSection copy={config.sectionCopy.compliance} badges={config.compliance} />
        {!config.caseStudy.hidden && (
          <CaseStudySection copy={config.sectionCopy.caseStudy} caseStudy={config.caseStudy} />
        )}
        <FinalCtaSection cta={config.cta} />
      </main>

      <SiteFooter />
    </div>
  );
}
