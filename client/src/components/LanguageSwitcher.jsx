import { Globe2 } from 'lucide-react';
import { useEffect } from 'react';
import { setLanguage, useLanguage } from '../i18n/locale';
export default function LanguageSwitcher() {
  const language = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return (
    <div className="language-picker" role="region" aria-label="Language / භාෂාව / மொழி">
      <Globe2 size={18} aria-hidden="true" />
      <label className="language-picker-label" htmlFor="hms-language">
        Language / භාෂාව / மொழி
      </label>
      <select
        id="hms-language"
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
      >
        <option value="en" lang="en">
          English
        </option>
        <option value="si" lang="si">
          සිංහල
        </option>
        <option value="ta" lang="ta">
          தமிழ்
        </option>
      </select>
    </div>
  );
}
