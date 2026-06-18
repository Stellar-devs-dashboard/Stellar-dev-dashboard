import { useMemo, useState } from 'react';
import {
  getActiveProfileName,
  loadConfigProfiles,
  setActiveProfileName,
  upsertProfile,
  removeProfile,
  getEnvironmentConfig,
} from '../lib/config';
import {
  loadPreferences,
  savePreferences,
  updatePreference,
  type UserPreferences,
} from '../utils/preferences';

export interface ConfigProfile {
  name: string;
  config: ReturnType<typeof getEnvironmentConfig>;
}

export function useSettings() {
  const [profiles, setProfiles] = useState<ConfigProfile[]>(() => loadConfigProfiles());
  const [activeProfileName, setActiveNameState] = useState(() => getActiveProfileName());
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());

  const activeProfile = useMemo(() => {
    return (
      profiles.find((profile) => profile.name === activeProfileName) || {
        name: 'default',
        config: getEnvironmentConfig(),
      }
    );
  }, [profiles, activeProfileName]);

  function setActiveProfile(name: string) {
    setActiveProfileName(name);
    setActiveNameState(name);
  }

  function saveProfile(name: string, config: ConfigProfile['config']) {
    const nextProfiles = upsertProfile(name, config);
    setProfiles(nextProfiles);
    setActiveProfile(name);
  }

  function deleteProfile(name: string) {
    const nextProfiles = removeProfile(name);
    setProfiles(nextProfiles);
    const nextActive = getActiveProfileName();
    setActiveNameState(nextActive);
  }

  function setAllPreferences(nextPreferences: UserPreferences) {
    setPreferences(savePreferences(nextPreferences));
  }

  function setPreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPreferences(updatePreference(key, value));
  }

  return {
    profiles,
    activeProfile,
    activeProfileName,
    setActiveProfile,
    saveProfile,
    deleteProfile,
    preferences,
    setAllPreferences,
    setPreference,
  };
}

export default useSettings;
