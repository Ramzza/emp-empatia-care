import { AppointmentCallout } from "../components/appointment-callout";
import { Contact } from "../components/contact";
import { Hero } from "../components/hero";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { Specialties } from "../components/specialties";
import { Team } from "../components/team";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Specialties />
        <Team />
        <AppointmentCallout />
        <Contact />
      </main>
      <SiteFooter />
    </>
  );
}
