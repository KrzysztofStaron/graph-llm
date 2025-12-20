import ArrowButton from "./ui/ArrowButton";
import MonoLabel from "./ui/MonoLabel";

interface LandingPageProps {
  onStart: () => void;
}

const LandingPage = ({ onStart }: LandingPageProps) => {
  return (
    <main className="flex flex-col items-center justify-center h-screen relative z-10 max-w-[1024px] mx-auto">
      <h1 className="text-4xl font-bold">Understand the universe </h1>

      <MonoLabel text="WITH AI" />

      <div className="mt-10 min-w-lg border-l-2 rounded-bl-full border-white/10 px-24 p-10 pb-[200px] relative overflow-hidden">
        <h3 className="text-2xl relative z-10">Graph UX</h3>
        <p className="text-secondary mt-2 relative z-10">
          Free yourself from contrains of linearity, embrace exploration. <br />
          Avalible now on web
        </p>
        <ArrowButton text="USE NOW" onClick={onStart} />
      </div>
    </main>
  );
};

export default LandingPage;

