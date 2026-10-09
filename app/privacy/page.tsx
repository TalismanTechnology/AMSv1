import type { Metadata } from "next";
import Link from "next/link";
import {
  ContactEmailLink,
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/legal/legal-page";

// DRAFT — not yet reviewed by counsel. Every statement about what the product
// does is grounded in the code (see the PR description for file references);
// statements about what we will or won't do are policy commitments.

export const metadata: Metadata = {
  title: "Privacy Policy — AskMySchool",
  description:
    "How AskMySchool collects, uses, and protects information for parents and school staff.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro={
        <>
          <p>
            AskMySchool (&ldquo;AskMySchool,&rdquo; &ldquo;we,&rdquo;
            &ldquo;us&rdquo;) is an assistant that answers parents&apos;
            questions using documents, calendars, and announcements their
            school has approved. This policy explains what information we
            handle at askmyschool.app and in our iOS and Android apps (the
            &ldquo;Service&rdquo;), why, who we share it with, and the choices
            you have.
          </p>
          <p className="mt-4">
            AskMySchool is built and operated by a small independent team. If
            anything here is unclear, email <ContactEmailLink />.
          </p>
        </>
      }
    >
      <LegalSection id="schools" title="1. Your school and AskMySchool">
        <p>
          We provide the Service to schools, and parents get access through
          their school. The school decides which documents, calendars, and
          announcements go into the Service and which families may use it. For
          information that comes from a school&apos;s records (for example, its
          parent roster), the school is in control of that information and we
          process it on the school&apos;s behalf and under its direction.
        </p>
        <p>
          Where a school is subject to the U.S. Family Educational Rights and
          Privacy Act (FERPA), we intend to act as a &ldquo;school
          official&rdquo; with a legitimate educational interest: we use
          school-provided information only to provide the Service to that
          school, we stay under the school&apos;s direct control with respect
          to that information, and we do not re-disclose it except as described
          here or as the school directs. Questions about your school&apos;s own
          records should go to your school.
        </p>
      </LegalSection>

      <LegalSection id="children" title="2. Children's privacy">
        <p>
          The Service is for parents, guardians, and school staff. It is not
          directed to children, and we do not knowingly allow children under 13
          to create accounts or use it. Parent sign-in is limited to people
          their school&apos;s Blackbaud system identifies as a parent or
          guardian. If you believe a child has given us personal information,
          contact us and we will delete it.
        </p>
        <p>
          We keep information about students to the minimum the Service needs:
          the first names (or names) and grade levels a parent chooses to enter
          so answers can be tailored to the right grade. We do not import
          student records, grades, attendance, or other education records from
          the school&apos;s systems.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="3. Information we collect">
        <p>
          <strong>Account information.</strong> When a parent signs in with
          their school&apos;s Blackbaud parent portal, Blackbaud tells us their
          email address, name, Blackbaud user ID, and whether the school&apos;s
          records list them as a parent. We use this to create or find their
          AskMySchool account and confirm they belong to that school. We do not
          receive or store your Blackbaud password, and we do not keep the
          sign-in token Blackbaud issues to you after sign-in completes. School
          staff accounts use an email address and password managed by our
          authentication provider (Supabase).
        </p>
        <p>
          <strong>Profile and children.</strong> Your name, email, school
          membership and role, whether you have finished onboarding, and the
          children you add (name and grade level). You can edit or remove
          children in your profile at any time.
        </p>
        <p>
          <strong>Questions and conversations.</strong> The questions you ask,
          the answers we generate, the documents cited, conversation titles,
          and any thumbs-up/down feedback you give. Conversations are saved so
          you can return to them and search them.
        </p>
        <p>
          <strong>Usage information.</strong> We record a usage event each time
          a question is asked (the question text, which school documents were
          used, and the time). When we can&apos;t find an answer in the
          school&apos;s documents, we log the question so the school can see
          what information is missing. We also keep notifications we send you
          in the app and which announcements you have dismissed.
        </p>
        <p>
          <strong>Device information (mobile apps).</strong> If you allow
          notifications in our iOS or Android app, we store your device&apos;s
          push notification token and platform (iOS or Android), linked to your
          account. Signing out removes that device&apos;s token.
        </p>
        <p>
          <strong>School roster.</strong> For schools that connect Blackbaud,
          we sync the school&apos;s parent/guardian roster once a day: Blackbaud
          user ID, email address, first (or preferred) name, last name, and
          role. We use it only to recognize parents of that school. Students
          are not included in this sync.
        </p>
        <p>
          <strong>School content.</strong> Documents, calendars, events, and
          announcements that school staff upload, sync from Blackbaud, or send
          to the school&apos;s private AskMySchool email address. For emailed
          content we also keep a log of each message received (sender address,
          subject, and whether it was accepted). School staff are responsible
          for not sending us content that contains private information about
          individual students or families.
        </p>
        <p>
          <strong>Staff activity.</strong> Certain administrative actions by
          school staff (for example, approving users or changing documents) are
          recorded in an audit log visible to that school&apos;s
          administrators.
        </p>
        <p>
          We do not use third-party advertising or third-party analytics
          trackers on the Service, and we do not collect precise location.
        </p>
      </LegalSection>

      <LegalSection id="use" title="4. How we use information">
        <LegalList>
          <li>To sign you in and confirm you belong to your school.</li>
          <li>
            To answer your questions from your school&apos;s approved content,
            tailored to your children&apos;s grade levels, with citations.
          </li>
          <li>
            To send announcements and notifications your school publishes,
            including push notifications if you turn them on.
          </li>
          <li>
            To help your school improve its information, for example by showing
            school administrators common questions and questions the Service
            couldn&apos;t answer.
          </li>
          <li>To keep the Service secure, debug problems, and prevent abuse.</li>
        </LegalList>
        <p>
          We do not sell personal information, we do not use it for targeted
          advertising, and we do not build profiles of students or families for
          any purpose unrelated to providing the Service.
        </p>
      </LegalSection>

      <LegalSection id="ai" title="5. AI processing">
        <p>
          To answer a question, we send the question, the recent conversation,
          relevant excerpts of your school&apos;s documents and calendar, and
          your children&apos;s names and grade levels to Google&apos;s Gemini
          API, which generates the answer. We also use Google&apos;s Gemini
          models to process school documents (for example, to extract text,
          summarize, classify, and index them).
        </p>
        <p>
          We do not use your data to train our own AI models. Google processes
          this data as our service provider under the Gemini API terms that
          apply to our account; please see{" "}
          <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">
            Google&apos;s Gemini API Additional Terms
          </a>{" "}
          for how Google handles API data.
        </p>
        <p>
          <strong>AI answers can be wrong.</strong> Always check important
          information (deadlines, health and safety, money) against the cited
          document or with your school directly.
        </p>
      </LegalSection>

      <LegalSection id="who-sees" title="6. Who can see your information">
        <p>
          <strong>Your school&apos;s administrators</strong> can see the
          members of their school and the children they have added, and they
          can view questions asked within their school (including saved
          conversations, usage statistics, and questions the Service
          couldn&apos;t answer) so they can support families and improve their
          information. They cannot see information from other schools.
        </p>
        <p>
          <strong>AskMySchool</strong> personnel can access data when needed to
          operate, support, and secure the Service.
        </p>
        <p>
          <strong>Service providers</strong> process data for us only to run
          the Service:
        </p>
        <LegalList>
          <li>
            <strong>Supabase</strong> &mdash; database, file storage, and
            authentication.
          </li>
          <li>
            <strong>Vercel</strong> &mdash; website hosting and scheduled jobs.
          </li>
          <li>
            <strong>Google (Gemini API)</strong> &mdash; generating answers and
            processing school documents, as described above.
          </li>
          <li>
            <strong>Blackbaud</strong> &mdash; parent sign-in and, where the
            school connects it, roster and calendar sync. Your use of Blackbaud
            is governed by Blackbaud&apos;s and your school&apos;s terms.
          </li>
          <li>
            <strong>Resend</strong> &mdash; receiving email that schools forward
            to their private AskMySchool address.
          </li>
          <li>
            <strong>Apple Push Notification service and Google Firebase Cloud
            Messaging</strong> &mdash; delivering push notifications (the
            notification title and text, and your device token).
          </li>
          <li>
            <strong>Online Web Fonts (db.onlinewebfonts.com)</strong> &mdash;
            serves a font file used by the website. Like any web request, this
            shares your IP address and browser information with that provider;
            no account information is sent.
          </li>
        </LegalList>
        <p>
          We may also disclose information if required by law, to protect the
          safety of any person, or as part of a merger or transfer of the
          Service (in which case this policy&apos;s commitments will continue
          to apply to the transferred data).
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="7. Cookies and local storage">
        <p>We use only cookies needed for the Service to work:</p>
        <LegalList>
          <li>Authentication cookies that keep you signed in (Supabase).</li>
          <li>
            Short-lived security cookies used during Blackbaud sign-in and when
            a school connects its Blackbaud account.
          </li>
          <li>
            In the mobile apps, a cookie that remembers this device&apos;s push
            token so signing out can turn off notifications for it.
          </li>
        </LegalList>
        <p>
          The website also uses your browser&apos;s session storage for small
          display preferences (for example, whether an intro animation has
          already played). We do not use advertising or cross-site tracking
          cookies.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="8. Retention and deletion">
        <p>
          We keep account and conversation data while your account is active
          so you can use the Service. You can delete individual conversations,
          or all of your conversations, at any time in the app, and you can
          remove children from your profile. Usage records and unanswered
          questions your school can see may be kept after a conversation is
          deleted, so that the school&apos;s statistics stay accurate.
        </p>
        <p>
          School administrators can remove a family&apos;s account. You can
          also ask us to delete your account and associated personal
          information by emailing <ContactEmailLink />; we will do so unless
          we need to keep something to comply with law or resolve a dispute.
          Parent roster records are refreshed daily from the school&apos;s
          Blackbaud system and marked inactive when a parent leaves the
          school&apos;s roster. When a school stops using the Service, we will
          delete or return its data at the school&apos;s request.
        </p>
      </LegalSection>

      <LegalSection id="security" title="9. Security">
        <p>
          Data is encrypted in transit (HTTPS). Database access rules limit
          each user to their own data and each school&apos;s administrators to
          their own school. Blackbaud connection credentials are encrypted
          before they are stored, sign-in codes for the mobile apps are stored
          only as hashes and expire quickly, and the parent roster is only
          accessible to our servers. No system is perfectly secure; if we learn
          of a breach affecting your information, we will notify affected
          schools and users as required by law.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="10. Your choices and rights">
        <p>
          You can view and update your profile and children, delete your
          conversations, and turn notifications off in your device settings.
          To access, correct, or delete other information, or to ask a question
          about this policy, contact us. Requests about education records held
          by your school should go to your school, and we will help the school
          respond. Depending on where you live, you may have additional rights
          under local law; we will honor those requests as the law requires.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="11. Changes to this policy">
        <p>
          We may update this policy as the Service changes. We will post the
          new version here with a new &ldquo;Last updated&rdquo; date, and for
          material changes we will notify schools and, where appropriate,
          users before the change takes effect.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="12. Contact">
        <p>
          Questions or requests: <ContactEmailLink />. See also our{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
