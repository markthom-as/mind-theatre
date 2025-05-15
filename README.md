# Mind Theatre Web

[**Live Production Site: https://mind-theatre.vercel.app/**](https://mind-theatre.vercel.app/)

## Conceptual Foundations: A Freudian-Lacanian Mind Simulation

The "Mind Theatre" web application provides an interface to a system inspired by psychoanalytic theory, simulating a mind structured according to Freudian and Lacanian concepts. The core of this model, as detailed in its Python counterpart, involves multiple AI agents, each representing a distinct psychic component or function. This allows for an exploration of simulated "inner dialogue" and the emergence of an "observable emotional landscape."

### Core Psychoanalytic Concepts Modelled:

**Freudian Components:**

*   **The Structural Model:**
    *   **Id:** Represents the primal, instinctual urges, operating on the "pleasure principle." It seeks immediate gratification for desires related to nourishment, sex, aggression, and comfort, expressed through primary-process thinking (imagination, dream logic).
    *   **Ego:** Acts as the organizer of the personality, operating under the "reality principle." It mediates between the Id's demands, the Superego's injunctions, and external reality, employing secondary-process thinking (reasoning, planning, delaying gratification) and crafting compromise-formations.
    *   **Superego:** The moral component, internalizing societal and parental rules. It has two sub-parts:
        *   **Conscience:** The punitive aspect, enforcing rules through guilt and shame.
        *   **Ego-Ideal:** The aspirational aspect, holding up images of perfection and inspiring pride and ethical striving.
*   **Psychic Drives:**
    *   **Eros (Life Drive):** The drive towards unity, creation, connection, and the preservation of life. It transforms raw excitation into libidinal attachments.
    *   **Thanatos (Death Drive):** A drive towards tension-reduction, inertia, repetition, and a return to an inorganic state. It can manifest as self-sabotage or a fascination with limits, rather than literal harm.
*   **Defence Mechanisms:** The Ego employs various defence mechanisms (e.g., repression, sublimation, displacement, projection, rationalization) to manage anxiety and conflict. A dedicated "Defence Manager" agent may catalogue and select appropriate defences.

**Lacanian Components:**

*   **The Three Registers:**
    *   **Imaginary:** The realm of images, identification, rivalry, and mirror reflections. It's where the ego is formed through identification with an image, leading to potential narcissistic illusions and misrecognition (`méconnaissance`).
    *   **Symbolic:** The network of signifiers, language, law, social rules, and the "Big Other" (the symbolic order of culture and language). It structures the subject's reality and desire.
    *   **Real:** That which is outside of symbolization and resistant to imaginary capture. It represents trauma, irreducible gaps, the impossible, and the raw, unmediated aspects of existence.
*   **objet petit a:** The elusive, unattainable object-cause of desire. It's not the object one desires, but the void or lack that sets desire in motion, always remaining just out of reach.
*   **Sinthome:** A unique, singular symptom or mode of enjoyment (`jouissance`) that knots together the Real, Symbolic, and Imaginary registers for a particular subject, providing a form of stability or coherence, even if unconventional.
*   **The Four Discourses:** Models of social bonds and speech, representing different subject positions and relationships to knowledge and desire:
    *   **Discourse of the Master:** Authoritative speech that establishes order and meaning.
    *   **Discourse of the University:** The position of supposedly objective knowledge and expertise.
    *   **Discourse of the Hysteric:** Questions authority and pushes for the production of new knowledge by exposing the master's lack.
    *   **Discourse of the Analyst:** Aims to reveal the subject's truth by focusing on the `objet petit a` as the cause of desire.

### Multi-Agent Architecture:

*   **Parallel Cognition:** Each psychic component (Id, Ego, Imaginary, etc.) is an independent AI agent. When the user sends a message, it's broadcast to all agents concurrently. They each generate a response based on their specific programming and memory.
*   **Memory System:** Each agent typically maintains:
    *   An **Identity Block:** A static system prompt defining its role and core traits.
    *   **Working Memory:** A short-term buffer of recent interactions.
    *   **Episodic Vector Store:** A long-term memory of salient one-sentence summaries, retrieved based on similarity to the current context.
*   **Conscious Synthesiser:** A final agent reads the "inner dialogue" (the replies from all other agents) and integrates these potentially conflicting voices into a single, coherent, user-facing answer. This output aims to represent an "observable emotional landscape."

The "Mind Theatre" web application, therefore, offers a window into this simulated psychic architecture, allowing users to interact with and observe the "memories" or outputs of these distinct, theoretically-grounded AI agents.




## Getting Started

Follow these instructions to set up and run the project locally.

### Prerequisites

Make sure you have the following installed:
*   [Node.js](https://nodejs.org/) (LTS version recommended)
*   [npm](https://www.npmjs.com/) (comes with Node.js) or [yarn](https://yarnpkg.com/)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd mind-theatre-web
    ```

2.  **Install dependencies:**
    Using npm:
    ```bash
    npm install
    ```
    Or using yarn:
    ```bash
    yarn install
    ```

### Environment Variables

This project uses environment variables for configuration.

1.  **Sync with Vercel (if applicable):**
    If your project is linked to Vercel and you want to pull environment variables from there, you can use the Vercel CLI:
    ```bash
    vercel env pull .env.development.local
    ```
    Ensure you have the Vercel CLI installed (`npm i -g vercel`) and are logged in.

2.  **Manual Setup:**
    Alternatively, create a `.env.development.local` file in the root of the `mind-theatre-web` directory and add the necessary environment variables. You can often find a `.env.example` or similar file in projects to use as a template (though one was not detected here).

    Example format:
    ```env
    DATABASE_URL="postgresql://user:password@host:port/database"
    # Add other necessary variables
    ```

### Running the Development Server

To start the development server:

Using npm:
```bash
npm run dev
```

Or using yarn:
```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) (or the port specified in your terminal) with your browser to see the result.

## Available Scripts

From `package.json`:

*   `dev`: Runs the Next.js development server.
*   `build`: Builds the application for production. This includes `prisma generate`.
*   `start`: Starts the production server (after running `build`).
*   `prisma:seed`: Seeds the database using the `prisma/seed.ts` script.

## Tech Stack

*   **Framework:** [Next.js](https://nextjs.org/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
*   **ORM:** [Prisma](https://www.prisma.io/)
*   **Database:** PostgreSQL (inferred from Prisma usage, please verify)
*   **Deployment:** [Vercel](https://vercel.com/) (inferred from `.vercel` directory and previous context)

## AI Technologies

This project integrates with advanced AI models and services to power its features:

*   **OpenAI:** Utilizes powerful language models from OpenAI, likely for generating, processing, or understanding agent memories and interactions.
*   **Ollama:** Enables the use of various open-source large language models locally, offering flexibility and control over AI capabilities.

## Building for Production

To build the application for production:

Using npm:
```bash
npm run build
```

Or using yarn:
```bash
yarn build
```

This command will create an optimized build of your application in the `.next` folder.

## Deployment

This project is set up for deployment on [Vercel](https://vercel.com/). Connect your Git repository to Vercel for automatic deployments on push.

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature-name`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add some feature'`).
5. Push to the branch (`git push origin feature/your-feature-name`).
6. Open a Pull Request.

## License

This project is currently unlicensed. Consider adding an [MIT License](https://opensource.org/licenses/MIT) or another open-source license if appropriate.