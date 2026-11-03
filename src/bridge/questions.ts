import type { Answer, PendingQuestion } from './protocol.ts';

export type Submission = { ok: true } | { ok: false; code: 'invalid' | 'stale'; message: string };

export interface PendingOfficeQuestion {
  question: PendingQuestion;
  response: Promise<Answer[]>;
  submit(requestId: string, answers: Answer[]): Submission;
  submitMessage(requestId: string, text: string): Submission;
  cancel(): void;
}

export function createPendingQuestion(requestId: string, questions: PendingQuestion['questions']): PendingOfficeQuestion {
  const { promise: response, resolve } = Promise.withResolvers<Answer[]>();
  let settled = false;
  const question: PendingQuestion = { requestId, questions };

  const submit = (submittedRequestId: string, answers: Answer[]): Submission => {
    if (settled || submittedRequestId !== requestId) {
      return { ok: false, code: 'stale', message: 'La pregunta ya no está pendiente' };
    }
    if (answers.length !== questions.length) {
      return { ok: false, code: 'invalid', message: 'Responde todas las preguntas en el orden indicado' };
    }
    for (const [index, answer] of answers.entries()) {
      const expected = questions[index];
      if (!expected || answer.id !== expected.id) {
        return { ok: false, code: 'invalid', message: 'Las respuestas no coinciden con las preguntas pendientes' };
      }
      const selected = new Set<string>();
      for (const label of answer.selectedOptions) {
        if (!expected.options.some(option => option.label === label) || selected.has(label)) {
          return { ok: false, code: 'invalid', message: 'La respuesta incluye una opción desconocida o repetida' };
        }
        selected.add(label);
      }
      if (!(expected.multi ?? false) && selected.size > 1) {
        return { ok: false, code: 'invalid', message: 'Esta pregunta solo admite una opción' };
      }
      if (!(expected.multi ?? false) && selected.size === 0 && answer.customInput === undefined) {
        return { ok: false, code: 'invalid', message: 'Selecciona una opción o escribe una respuesta' };
      }
    }
    settled = true;
    resolve(answers.map(answer => ({ ...answer, selectedOptions: [...answer.selectedOptions] })));
    return { ok: true };
  };

  return {
    question,
    response,
    submit,
    submitMessage(submittedRequestId, text) {
      if (questions.length !== 1) {
        return { ok: false, code: 'invalid', message: 'Usa el formulario de preguntas para responder varias preguntas' };
      }
      const only = questions[0]!;
      return submit(submittedRequestId, [{ id: only.id, selectedOptions: [], customInput: text }]);
    },
    cancel() { settled = true; },
  };
}

export function raceAsk<T>(native: Promise<T>, office: Promise<Answer[]>, abortNative: () => void): Promise<
  { kind: 'native'; result: T } | { kind: 'office'; answers: Answer[] }
> {
  return Promise.race([
    native.then(result => ({ kind: 'native' as const, result })),
    office.then(answers => ({ kind: 'office' as const, answers })),
  ]).then(winner => {
    if (winner.kind === 'office') abortNative();
    return winner;
  });
}
