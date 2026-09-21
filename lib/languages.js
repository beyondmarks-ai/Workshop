export const languageCodes = {
  English: "en-IN",
  Hindi: "hi-IN",
  Bengali: "bn-IN",
  Gujarati: "gu-IN",
  Kannada: "kn-IN",
  Malayalam: "ml-IN",
  Marathi: "mr-IN",
  Odia: "od-IN",
  Punjabi: "pa-IN",
  Tamil: "ta-IN",
  Telugu: "te-IN"
};

export const languages = Object.keys(languageCodes);

export const getLanguageCode = (language) => languageCodes[language]
  || languageCodes[String(language || "").replace(/^./, (letter) => letter.toUpperCase())];

export const getLanguageName = (code) => Object.entries(languageCodes).find(([, value]) => value === code)?.[0] || "English";
