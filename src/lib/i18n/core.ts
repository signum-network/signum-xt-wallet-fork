import { enUS, enGB, fr, zhCN, zhTW, ja, ko, uk, ru, es, ptBR } from 'date-fns/locale';
import browser from 'webextension-polyfill';

import cldrjsLocales from './cldrjs-locales.json';
import { areLocalesEqual, processTemplate, toList } from './helpers';
import { getSavedLocale } from './saving';
import { FetchedLocaleMessages, LocaleMessages, Substitutions } from './types';

const dateFnsLocales: Record<string, Locale> = {
  en: enUS,
  en_GB: enGB,
  fr,
  zh_CN: zhCN,
  zh_TW: zhTW,
  ja,
  ko,
  uk,
  ru,
  es,
  pt_BR: ptBR
};

let fetchedLocaleMessages: FetchedLocaleMessages = {
  target: null,
  fallback: null
};

let cldrLocale = cldrjsLocales.en;

// export async function init() {
//
//   const refetched: FetchedLocaleMessages = {
//     target: null,
//     fallback: null
//   };
//
//   const saved = getSavedLocale();
//
//   console.log('init', saved)
//   if (saved) {
//     const native = getNativeLocale();
//
//     await Promise.all([
//       // Fetch target locale messages if needed
//       (async () => {
//         if (!areLocalesEqual(saved, native)) {
//           refetched.target = await fetchLocaleMessages(saved);
//         }
//       })(),
//       // Fetch fallback locale messages if needed
//       (async () => {
//         const deflt = getDefaultLocale();
//         if (!areLocalesEqual(deflt, native) && !areLocalesEqual(deflt, saved)) {
//           refetched.fallback = await fetchLocaleMessages(deflt);
//         }
//       })()
//     ]);
//   }
//
//   fetchedLocaleMessages = refetched;
//   cldrLocale = (cldrjsLocales as Record<string, any>)[getCurrentLocale()] || cldrjsLocales.en;
// }

export async function init() {
  const refetched: FetchedLocaleMessages = {
    target: null,
    fallback: null
  };

  const saved = getSavedLocale();
  const native = getNativeLocale();
  const def = getDefaultLocale();
  await Promise.all([
    (async () => {
      refetched.target = await fetchLocaleMessages(saved || native);
    })(),
    (async () => {
      refetched.fallback = await fetchLocaleMessages(def);
    })()
  ]);

  fetchedLocaleMessages = refetched;
  cldrLocale = (cldrjsLocales as Record<string, any>)[getCurrentLocale()] || cldrjsLocales.en;
}

export function getMessage(messageName: string, substitutions?: Substitutions) {
  const val = fetchedLocaleMessages.target?.[messageName] ?? fetchedLocaleMessages.fallback?.[messageName];

  if (!val) {
    return '';
  }

  try {
    if (val.placeholders) {
      const params = toList(substitutions).reduce((prms, sub, i) => {
        const pKey = val.placeholderList?.[i] ?? i;
        return pKey ? { ...prms, [pKey]: sub } : prms;
      }, {});

      return processTemplate(val.message, params);
    }

    return val.message;
  } catch (err: any) {
    console.error(err);

    return '';
  }
}

export function getDateFnsLocale() {
  return dateFnsLocales[getCurrentLocale()] || enUS;
}

export function getCldrLocale() {
  return cldrLocale;
}

export function getNumberSymbols() {
  return cldrLocale.numbers['symbols-numberSystem-latn'];
}

export function getCurrentLocale() {
  return getSavedLocale() || getNativeLocale();
}

export function getNativeLocale() {
  return browser.i18n.getUILanguage();
}

export function getDefaultLocale(): string {
  const manifest = browser.runtime.getManifest();
  return manifest.default_locale || 'en';
}

export async function fetchLocaleMessages(locale: string) {
  console.log('fetching local messages');
  const dirName = locale.replace('-', '_');
  const url = browser.runtime.getURL(`_locales/${dirName}/messages.json`);

  try {
    const res = await fetch(url);
    const messages: LocaleMessages = await res.json();
    console.log('messages', messages);
    appendPlaceholderLists(messages);
    return messages;
  } catch (err: any) {
    return null;
  }
}

function appendPlaceholderLists(messages: LocaleMessages) {
  for (const name in messages) {
    const val = messages[name];
    if (val.placeholders) {
      val.placeholderList = [];
      for (const pKey in val.placeholders) {
        const { content } = val.placeholders[pKey];
        const index = +content.substring(1) - 1;
        val.placeholderList[index] = pKey;
      }
    }
  }
}
