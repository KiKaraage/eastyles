import React from "react";
import { useDebugMode } from "../../hooks/useStorage";
import BackupRestore from "./BackupRestore";

const Settings = () => {
  const { debugMode, setDebugMode } = useDebugMode();

  const handleDebugModeChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setDebugMode(event.target.checked);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Settings</h2>

      {/* Debug Mode Toggle */}
      <div className="form-control">
        <label className="label cursor-pointer" htmlFor="debug-toggle">
          <span className="label-text">Enable Debug Mode</span>
          <input
            id="debug-toggle"
            type="checkbox"
            className="toggle toggle-primary"
            checked={debugMode}
            onChange={handleDebugModeChange}
          />
        </label>
      </div>

      {/* Backup & Restore Section */}
      <BackupRestore />
    </div>
  );
};

export default Settings;
