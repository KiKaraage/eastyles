import { useState } from "react";
import reactLogo from "@/assets/react.svg";
import wxtLogo from "/wxt.svg";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="bg-base-200 shadow-xl p-6 max-w-lg w-full min-w-72">
      <div className="flex justify-center space-x-4 mb-6">
        <a href="https://wxt.dev" target="_blank" rel="noopener noreferrer">
          <img src={wxtLogo} className="w-16 h-16" alt="WXT logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noopener noreferrer">
          <img
            src={reactLogo}
            className="w-16 h-16 logo react"
            alt="React logo"
          />
        </a>
      </div>
      <h1 className="text-2xl font-bold text-center mb-4">WXT + React</h1>
      <div className="text-center mb-4">
        <button
          className="btn btn-primary rounded-md"
          onClick={() => setCount((count) => count + 1)}
        >
          count is {count}
        </button>
      </div>
      <p className="text-sm text-center text-base-content/70 mb-2">
        Edit{" "}
        <code className="font-mono bg-base-300 px-1 py-0.5 rounded">
          src/App.tsx
        </code>{" "}
        and save to test HMR
      </p>
      <p className="text-xs text-center text-base-content/50">
        Click on the WXT and React logos to learn more
      </p>
    </div>
  );
}

export default App;
