(function () {
  'use strict';

  // Statutory limits by jurisdiction and statutory year (6 April to 5 April).
  // Keyed by jurisdiction, then by the start year of the statutory year
  // (e.g. 2025 covers 6 April 2025 to 5 April 2026).
  const LIMITS = {
    GB: {
      2025: { weeklyCap: 719,  overallCap: 21570, label: '6 April 2025 to 5 April 2026' },
      2026: { weeklyCap: 751,  overallCap: 22530, label: '6 April 2026 to 5 April 2027' }
    },
    NI: {
      2025: { weeklyCap: 749,  overallCap: 22470, label: '6 April 2025 to 5 April 2026' },
      2026: { weeklyCap: 783,  overallCap: 23490, label: '6 April 2026 to 5 April 2027' }
    }
  };

  // Return the statutory-year start year that contains the given date.
  // The statutory year runs from 6 April to the following 5 April.
  function statutoryYearStart(date) {
    const y = date.getUTCFullYear();
    const sixthApril = Date.UTC(y, 3, 6); // month index 3 = April
    return date.getTime() >= sixthApril ? y : y - 1;
  }

  // Parse a yyyy-mm-dd string as a UTC date so timezone offsets never shift it.
  function parseISODate(s) {
    if (!s) return null;
    const parts = s.split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!y || !m || !d) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }

  // Full years between two UTC dates (floor), as used for age and service.
  // Treats the anniversary as the moment the next year ticks over.
  function completeYearsBetween(from, to) {
    let years = to.getUTCFullYear() - from.getUTCFullYear();
    const anniversaryThisYear = Date.UTC(
      to.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate()
    );
    if (to.getTime() < anniversaryThisYear) years -= 1;
    return years;
  }

  // Subtract whole years from a UTC date, preserving month and day.
  function subtractYearsUTC(date, years) {
    return new Date(Date.UTC(
      date.getUTCFullYear() - years,
      date.getUTCMonth(),
      date.getUTCDate()
    ));
  }

  function formatGBP(n) {
    return '£' + n.toLocaleString('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDateGB(d) {
    return d.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
    });
  }

  // Core calculation. Returns a result object with every figure for the breakdown.
  function calculate(input) {
    const { jurisdiction, dob, startDate, terminationDate, weeklyPay } = input;

    // Resolve statutory year and the applicable caps.
    const statYear = statutoryYearStart(terminationDate);
    const jurisdictionLimits = LIMITS[jurisdiction];
    if (!jurisdictionLimits) {
      throw new Error('Unknown jurisdiction.');
    }
    const limits = jurisdictionLimits[statYear];
    if (!limits) {
      throw new Error(
        'This calculator currently supports the 2025 and 2026 statutory years only. ' +
        'A breakdown for previous years cannot be calculated at this time.'
      );
    }

    // Length of continuous service.
    const serviceYearsComplete = completeYearsBetween(startDate, terminationDate);
    if (serviceYearsComplete < 2) {
      return {
        eligible: false,
        reason: 'Fewer than two years of continuous service. Not eligible for a statutory redundancy payment.',
        statYearLabel: limits.label,
        serviceYearsComplete
      };
    }

    const yearsUsed = Math.min(serviceYearsComplete, 20);

    // For each counted year of service, work out the employee's age at the start
    // of that year of service and allocate the matching weeks of pay.
    let weeksUnder22 = 0;   // half week each
    let weeksMid = 0;       // one week each (age 22 to 40)
    let weeksOver41 = 0;    // one and a half weeks each (age 41 or over)

    for (let i = 1; i <= yearsUsed; i++) {
      const startOfServiceYear = subtractYearsUTC(terminationDate, i);
      const ageAtStartOfYear = completeYearsBetween(dob, startOfServiceYear);
      if (ageAtStartOfYear >= 41) {
        weeksOver41 += 1;
      } else if (ageAtStartOfYear >= 22) {
        weeksMid += 1;
      } else {
        weeksUnder22 += 1;
      }
    }

    const totalWeeks = weeksUnder22 * 0.5 + weeksMid * 1 + weeksOver41 * 1.5;

    // Weekly pay cap.
    const weeklyPayUsed = Math.min(weeklyPay, limits.weeklyCap);
    const weeklyCapApplied = weeklyPay > limits.weeklyCap;

    // Subtotal and overall cap.
    const subtotal = totalWeeks * weeklyPayUsed;
    const overallCapApplied = subtotal > limits.overallCap;
    const finalAmount = Math.min(subtotal, limits.overallCap);

    return {
      eligible: true,
      statYearLabel: limits.label,
      serviceYearsComplete,
      yearsUsed,
      weeksUnder22,
      weeksMid,
      weeksOver41,
      totalWeeks,
      weeklyPayEntered: weeklyPay,
      weeklyCap: limits.weeklyCap,
      weeklyPayUsed,
      weeklyCapApplied,
      subtotal,
      overallCap: limits.overallCap,
      overallCapApplied,
      finalAmount
    };
  }

  function showEmpty() {
    document.getElementById('results-empty').hidden = false;
    document.getElementById('results-filled').hidden = true;
  }

  function showFilled() {
    document.getElementById('results-empty').hidden = true;
    document.getElementById('results-filled').hidden = false;
  }

  // Validate the form, build an input object, and render the result.
  function onSubmit(e) {
    e.preventDefault();

    const errorEl = document.getElementById('form-error');
    errorEl.textContent = '';

    const jurisdiction = document.getElementById('jurisdictionToggle').checked ? 'NI' : 'GB';
    const dob = parseISODate(document.getElementById('dob').value);
    const startDate = parseISODate(document.getElementById('startDate').value);
    const terminationDate = parseISODate(document.getElementById('terminationDate').value);
    const weeklyPayRaw = document.getElementById('weeklyPay').value;
    const weeklyPay = parseFloat(weeklyPayRaw);

    if (!dob) return fail('Please enter a valid date of birth.');
    if (!startDate) return fail('Please enter a valid employment start date.');
    if (!terminationDate) return fail('Please enter a valid date of redundancy.');
    if (!(terminationDate > startDate)) return fail('Date of redundancy must be after the employment start date.');
    if (!(startDate > dob)) return fail('Employment start date must be after the date of birth.');
    if (!(weeklyPay >= 0) || Number.isNaN(weeklyPay)) return fail('Please enter a valid gross weekly pay.');

    let result;
    try {
      result = calculate({ jurisdiction, dob, startDate, terminationDate, weeklyPay });
    } catch (err) {
      return fail(err.message);
    }

    render(result, { jurisdiction, terminationDate });

    function fail(msg) {
      errorEl.textContent = msg;
      showEmpty();
    }
  }

  function render(result, meta) {
    const set = (id, value) => { document.getElementById(id).textContent = value; };

    const jurisdictionLabel = meta.jurisdiction === 'GB'
      ? 'Great Britain (England, Scotland, Wales)'
      : 'Northern Ireland';

    set('r-jurisdiction', jurisdictionLabel);
    set('r-termination', formatDateGB(meta.terminationDate));
    set('r-statyear', result.statYearLabel);

    if (!result.eligible) {
      set('headline-amount', formatGBP(0));
      set('r-service', result.serviceYearsComplete + ' complete year(s)');
      set('r-years', '0');
      set('r-under22', '0');
      set('r-mid', '0');
      set('r-over41', '0');
      set('r-weeks', '0');
      set('r-pay-entered', '-');
      set('r-cap-weekly', '-');
      set('r-pay-used', '-');
      set('r-subtotal', '-');
      set('r-cap-overall', '-');
      set('r-final', formatGBP(0));
      document.getElementById('r-note').textContent = result.reason;
      showFilled();
      return;
    }

    set('r-service', result.serviceYearsComplete + ' complete year(s)');
    set('r-years', String(result.yearsUsed));
    set('r-under22', result.weeksUnder22 + ' year(s)');
    set('r-mid', result.weeksMid + ' year(s)');
    set('r-over41', result.weeksOver41 + ' year(s)');
    set('r-weeks', result.totalWeeks.toString());
    set('r-pay-entered', formatGBP(result.weeklyPayEntered));
    set('r-cap-weekly', formatGBP(result.weeklyCap));
    set('r-pay-used', formatGBP(result.weeklyPayUsed) +
      (result.weeklyCapApplied ? ' (capped)' : ''));
    set('r-subtotal', formatGBP(result.subtotal));
    set('r-cap-overall', formatGBP(result.overallCap) +
      (result.overallCapApplied ? ' (applied)' : ''));
    set('r-final', formatGBP(result.finalAmount));
    set('headline-amount', formatGBP(result.finalAmount));

    const notes = [];
    if (result.serviceYearsComplete > 20) {
      notes.push('Service exceeded 20 years; only the 20 most recent complete years were counted.');
    }
    if (result.weeklyCapApplied) {
      notes.push('Entered weekly pay exceeded the statutory weekly cap; the cap was used in the calculation.');
    }
    if (result.overallCapApplied) {
      notes.push('The subtotal exceeded the overall statutory award cap; the overall cap was applied.');
    }
    document.getElementById('r-note').textContent = notes.join(' ');
    showFilled();
  }

  function onReset() {
    showEmpty();
    document.getElementById('form-error').textContent = '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('srp-form').addEventListener('submit', onSubmit);
    document.getElementById('srp-form').addEventListener('reset', onReset);
  });

  // Expose for ad-hoc testing in the browser console.
  window.__SRP__ = { calculate, parseISODate, completeYearsBetween, statutoryYearStart, LIMITS };
})();
