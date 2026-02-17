import Head from 'next/head';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <>
      <Head>
        <title>Mind Theatre — Psychic Systems Interface</title>
        <meta
          name="description"
          content="Mind Theatre externalizes internal psychic dynamics by modeling id, ego, superego, and mediator as interacting computational actors."
        />
      </Head>

      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Mind Theatre — Psychic Systems Interface
          </h1>

          <section className="mt-10 space-y-4">
            <h2 className="text-xl font-semibold md:text-2xl">Overview</h2>
            <p className="leading-7 text-muted-foreground">
              Mind Theatre is a digital environment that externalizes internal
              psychic dynamics — instantiating classical psychoanalytic
              structures (id, ego, superego, and mediator) as interacting
              computational actors. Rather than presenting these categories as
              static labels or metaphors, the work treats them as systems that
              negotiate and evolve, using interaction, feedback loops, and
              emergent behavior as its primary materials.
            </p>
          </section>

          <section className="mt-10 space-y-4">
            <h2 className="text-xl font-semibold md:text-2xl">
              Conceptual Frame
            </h2>
            <p className="leading-7 text-muted-foreground">
              This project operates at the intersection of psychoanalytic
              theory, systems logic, and interactive design. It models internal
              tension and negotiation not as problems to be resolved, but as
              operative conditions that generate patterns of experience. The
              work reframes the psyche as a field of interaction, where
              constraint and feedback structure the behavior of dynamic agents,
              making visible the systemic forces that shape subjective
              experience.
            </p>
          </section>

          <section className="mt-10 space-y-4">
            <h2 className="text-xl font-semibold md:text-2xl">
              How It Functions
            </h2>
            <p className="leading-7 text-muted-foreground">
              Visitors engage with the interface on Mind Theatre&apos;s own site
              to observe how agents influence system states over time. Patterns
              emerge not as predetermined outcomes but as effects of ongoing
              negotiation between competing forces. The interface invites
              sustained attention and reflexive engagement, making visible the
              structural logics shaping internal life.
            </p>
          </section>

          <section className="mt-10 space-y-4">
            <h2 className="text-xl font-semibold md:text-2xl">Why It Matters</h2>
            <p className="leading-7 text-muted-foreground">
              Mind Theatre expands how we conceive of inner life — from a
              metaphorical space to an observable, actionable system. By
              modeling internal structures as interacting agents, the work
              reveals how meaning, conflict, and coherence arise through
              systemic dynamics rather than stable architectures.
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold md:text-2xl">Engage it here</h2>
            <p className="text-lg text-muted-foreground">
              Explore Mind Theatre directly in this interface.
            </p>
            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                Try it out
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
