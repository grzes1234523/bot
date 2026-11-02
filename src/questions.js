// Piętnaście pytań w trzech etapach (limit interfejsu Discord: 5 pól/modala).
// Maksymalne długości utrzymują podgląd odpowiedzi w granicach embedów Discorda.
export const QUESTION_STAGES = Object.freeze([
  Object.freeze({
    title: 'Etap 1/3 — podstawowe informacje',
    questions: Object.freeze([
      { key: 'position', label: '1. Na jakie stanowisko aplikujesz?', placeholder: 'Np. Helper, Moderator, Administrator', style: 'short', min: 2, max: 60 },
      { key: 'age', label: '2. Ile masz lat?', placeholder: 'Wpisz swój wiek (liczbę)', style: 'short', min: 1, max: 30 },
      { key: 'experience', label: '3. Jakie masz doświadczenie?', placeholder: 'Opisz poprzednie serwery, zadania lub wpisz brak.', style: 'paragraph', min: 2, max: 320 },
      { key: 'availability', label: '4. Ile czasu możesz poświęcać?', placeholder: 'Np. 1–2 godziny dziennie, wieczorami', style: 'short', min: 2, max: 100 },
      { key: 'motivation', label: '5. Dlaczego chcesz dołączyć?', placeholder: 'Opisz swoją motywację i cele.', style: 'paragraph', min: 15, max: 380 },
    ]),
  }),
  Object.freeze({
    title: 'Etap 2/3 — sytuacje i wiedza',
    questions: Object.freeze([
      { key: 'rules', label: '6. Jak egzekwujesz regulamin?', placeholder: 'Kiedy zwrócisz uwagę, a kiedy zastosujesz karę?', style: 'paragraph', min: 15, max: 360 },
      { key: 'scenario', label: '7. Gracz łamie regulamin — co robisz?', placeholder: 'Opisz swoje działania krok po kroku.', style: 'paragraph', min: 15, max: 400 },
      { key: 'conflict', label: '8. Dwóch graczy się kłóci — co robisz?', placeholder: 'W jaki sposób rozwiążesz spór?', style: 'paragraph', min: 15, max: 350 },
      { key: 'abuse', label: '9. Administrator nadużywa władzy?', placeholder: 'Jak zabezpieczysz dowody i komu to zgłosisz?', style: 'paragraph', min: 15, max: 350 },
      { key: 'tools', label: '10. Jakie narzędzia/komendy znasz?', placeholder: 'Np. moderacja, tickety, ostrzeżenia', style: 'short', min: 2, max: 180 },
    ]),
  }),
  Object.freeze({
    title: 'Etap 3/3 — współpraca',
    questions: Object.freeze([
      { key: 'teamwork', label: '11. Jak pracujesz w zespole?', placeholder: 'Jak współpracujesz i przyjmujesz uwagi?', style: 'paragraph', min: 10, max: 300 },
      { key: 'strengths', label: '12. Jakie są Twoje mocne strony?', placeholder: 'Wymień cechy pomocne w administracji.', style: 'paragraph', min: 10, max: 250 },
      { key: 'weaknesses', label: '13. Nad czym chcesz popracować?', placeholder: 'Co chcesz poprawić u siebie?', style: 'paragraph', min: 10, max: 250 },
      { key: 'improvements', label: '14. Co poprawiłbyś na serwerze?', placeholder: 'Podaj konkretny pomysł lub zmianę.', style: 'paragraph', min: 10, max: 320 },
      { key: 'additional', label: '15. Co jeszcze chcesz dodać?', placeholder: 'Opcjonalna wiadomość dla rekruterów.', style: 'paragraph', min: 0, max: 300, required: false },
    ]),
  }),
]);

export const ALL_QUESTIONS = Object.freeze(QUESTION_STAGES.flatMap(stage => stage.questions));

export function validateStepAnswers(step, values) {
  const stage = QUESTION_STAGES[step - 1];
  if (!stage) throw new Error('Nieprawidłowy etap formularza.');
  const result = {};
  for (const question of stage.questions) {
    const value = String(values[question.key] ?? '').trim();
    if ((question.required !== false || value.length) && (value.length < question.min || value.length > question.max)) {
      throw new Error(`Pytanie ${question.label}: odpowiedź musi mieć od ${question.min} do ${question.max} znaków.`);
    }
    result[question.key] = value;
  }
  if (step === 1 && (!/^\d{1,3}$/.test(result.age) || Number(result.age) < 1 || Number(result.age) > 120)) {
    throw new Error('W polu „Ile masz lat?” podaj liczbę od 1 do 120.');
  }
  return result;
}
