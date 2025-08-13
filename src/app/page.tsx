import Image from 'next/image';
import { PrayerSchedule } from "@/components/prayer-schedule";

export default function Home() {
  return (
    <div className="flex flex-col items-center min-h-screen p-4 sm:p-6 lg:p-8">
      <header className="w-full max-w-5xl mb-8">
        <div className="flex justify-center items-center gap-4 mb-2">
          <Image src="https://www.ibrnobrasil.com.br/files/2018/10/logoigrejapng.png" alt="Logo da Igreja" width={80} height={80} />
          <div className="flex flex-col items-center">
            <h1 className="text-4xl md:text-5xl font-bold text-primary tracking-tight font-handwriting">
              Torre de Oração
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">Igreja Batista Renovada no Brasil</p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-green-100 border border-green-200 text-green-800 rounded-lg text-center shadow-md">
          <p className="text-xs italic">"Agora, estarão abertos os meus olhos e atentos os meus ouvidos à oração deste lugar."</p>
          <p className="text-xs font-semibold mt-1">- 2 Crônicas 7:15</p>
        </div>
      </header>
      <main className="w-full max-w-5xl">
        <PrayerSchedule />
      </main>
    </div>
  );
}
