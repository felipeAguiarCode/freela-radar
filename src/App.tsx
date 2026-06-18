import { useCallback, useState } from 'react';
import { AppShell } from './components/AppShell';
import { SplashScreen } from './components/SplashScreen';

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const handleDone = useCallback(() => setSplashDone(true), []);

  return (
    <>
      <AppShell animateEntrance={splashDone} />
      {!splashDone && <SplashScreen onDone={handleDone} />}
    </>
  );
}
