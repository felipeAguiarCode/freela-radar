import { api } from '../ipc/api';

export function TrafficLights() {
  return (
    <div className="absolute top-4 right-4 z-30 flex items-center gap-2 app-no-drag">
      <button
        type="button"
        onClick={() => api.system.window('minimize')}
        className="traffic-light traffic-light--min hover:opacity-80 transition app-no-drag"
        aria-label="Minimizar"
      />
      <button
        type="button"
        onClick={() => api.system.window('maximize')}
        className="traffic-light traffic-light--max hover:opacity-80 transition app-no-drag"
        aria-label="Maximizar"
      />
      <button
        type="button"
        onClick={() => api.system.window('close')}
        className="traffic-light traffic-light--close hover:opacity-80 transition app-no-drag"
        aria-label="Fechar"
      />
    </div>
  );
}
