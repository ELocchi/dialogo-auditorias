import assert from "node:assert/strict";
import test from "node:test";
import { getCalendarDays, getSaoPauloToday, isCalendarDate, shiftCalendarMonth } from "../src/domain/visit-calendar.ts";

test("datas exigem formato canônico e rejeitam dias impossíveis", () => {
  for (const value of ["0001-01-01", "0099-12-31", "2024-02-29", "2000-02-29", "2026-09-30", "9999-12-31"]) {
    assert.equal(isCalendarDate(value), true, value);
  }
  for (const value of ["", "2026-2-01", " 2026-02-01", "2026-02-01T00:00:00Z", "2026-02-29", "1900-02-29", "2100-02-29", "2026-09-31", "2026-00-01", "2026-13-01", "2026-01-00", "0000-01-01", "10000-01-01"]) {
    assert.equal(isCalendarDate(value), false, value);
  }
});

test("setembro de 2026 começa na terça e termina com espaços vazios até sábado", () => {
  const days = getCalendarDays("2026-09");
  assert.equal(days.length, 35);
  assert.deepEqual(days.slice(0, 3), [null, null, "2026-09-01"]);
  assert.deepEqual(days.slice(-4), ["2026-09-30", null, null, null]);
  assert.equal(days.filter((day) => day !== null).length, 30);
});

test("fevereiro respeita anos bissextos e exceções de séculos", () => {
  for (const [month, count] of [["2024-02", 29], ["2025-02", 28], ["1900-02", 28], ["2000-02", 29], ["2100-02", 28]]) {
    const days = getCalendarDays(month);
    const dates = days.filter((day) => day !== null);
    assert.equal(dates.length, count, month);
    assert.equal(dates.at(-1), `${month}-${count}`);
    assert.equal(days.length % 7, 0);
  }
});

test("o calendário usa quatro ou seis semanas quando necessário sem datas de outros meses", () => {
  const february = getCalendarDays("2026-02");
  assert.equal(february.length, 28);
  assert.equal(february[0], "2026-02-01");
  assert.equal(february.at(-1), "2026-02-28");
  const august = getCalendarDays("2026-08");
  assert.equal(august.length, 42);
  assert.deepEqual(august.slice(0, 7), [null, null, null, null, null, null, "2026-08-01"]);
  assert.deepEqual(august.slice(-6), ["2026-08-31", null, null, null, null, null]);
});

test("anos de 1 a 99 mantêm ano e dia da semana originais", () => {
  assert.deepEqual(getCalendarDays("0001-01").slice(0, 2), [null, "0001-01-01"]);
  assert.deepEqual(getCalendarDays("0099-01").slice(0, 5), [null, null, null, null, "0099-01-01"]);
  assert.equal(getSaoPauloToday(new Date("0001-01-01T12:00:00Z")), "0001-01-01");
});

test("navegação atravessa dezembro/janeiro e permanece dentro dos anos suportados", () => {
  assert.equal(shiftCalendarMonth("2026-12", 1), "2027-01");
  assert.equal(shiftCalendarMonth("2027-01", -1), "2026-12");
  assert.equal(shiftCalendarMonth("0099-12", 1), "0100-01");
  assert.equal(shiftCalendarMonth("0001-01", -1), "0001-01");
  assert.equal(shiftCalendarMonth("9999-12", 1), "9999-12");
});

test("hoje usa São Paulo na virada UTC sem modificar a data recebida", () => {
  const instant = new Date("2026-09-14T02:59:59.999Z");
  const original = instant.getTime();
  assert.equal(getSaoPauloToday(instant), "2026-09-13");
  assert.equal(instant.getTime(), original);
  assert.equal(getSaoPauloToday(new Date("2026-09-14T03:00:00Z")), "2026-09-14");
  assert.equal(getSaoPauloToday(new Date("2027-01-01T01:00:00Z")), "2026-12-31");
});

test("meses, direções e instantes inválidos falham explicitamente", () => {
  for (const month of ["", "2026-1", "2026-00", "2026-13", "0000-01", "10000-01", "2026-01-01"]) {
    assert.throws(() => getCalendarDays(month), RangeError, month);
    assert.throws(() => shiftCalendarMonth(month, 1), RangeError, month);
  }
  assert.throws(() => shiftCalendarMonth("2026-09", 0), RangeError);
  assert.throws(() => shiftCalendarMonth("2026-09", 2), RangeError);
  assert.throws(() => getSaoPauloToday(new Date(NaN)), RangeError);
  assert.throws(() => getSaoPauloToday(new Date("0000-01-01T12:00:00Z")), RangeError);
  assert.throws(() => getSaoPauloToday(new Date("+010000-01-01T12:00:00Z")), RangeError);
});
