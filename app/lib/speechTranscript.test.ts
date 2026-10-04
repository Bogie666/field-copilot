import { describe, expect, it } from "vitest";
import { applySpeechResults } from "./speechTranscript";

type TestResult = { isFinal: boolean; 0: { transcript: string } };

function makeEvent(resultIndex: number, results: TestResult[]) {
  return { resultIndex, results };
}

describe("applySpeechResults", () => {
  it("only processes changed recognition results so transcripts are not doubled", () => {
    const first = applySpeechResults("", makeEvent(0, [
      { isFinal: true, 0: { transcript: "Found a failed capacitor" } },
    ]));

    const second = applySpeechResults(first.finalTranscript, makeEvent(1, [
      { isFinal: true, 0: { transcript: "Found a failed capacitor" } },
      { isFinal: true, 0: { transcript: "Outdoor fan motor is running" } },
    ]));

    expect(second.displayTranscript).toBe("Found a failed capacitor Outdoor fan motor is running");
  });

  it("shows interim text without committing it until the browser marks it final", () => {
    const interim = applySpeechResults("System not cooling", makeEvent(1, [
      { isFinal: true, 0: { transcript: "System not cooling" } },
      { isFinal: false, 0: { transcript: "checked filter" } },
    ]));

    expect(interim.finalTranscript).toBe("System not cooling");
    expect(interim.interimTranscript).toBe("checked filter");
    expect(interim.displayTranscript).toBe("System not cooling checked filter");
  });

  it("commits the final version of a prior interim result once it becomes final", () => {
    const committed = applySpeechResults("System not cooling", makeEvent(1, [
      { isFinal: true, 0: { transcript: "System not cooling" } },
      { isFinal: true, 0: { transcript: "Checked filter and breaker" } },
    ]));

    expect(committed.finalTranscript).toBe("System not cooling Checked filter and breaker");
    expect(committed.interimTranscript).toBe("");
  });
});
