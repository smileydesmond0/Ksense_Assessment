const fetch = require('node-fetch');
const API_KEY = 'ak_2bc95a06301b68c073359e6debfbbcffe7a14bca97836c0e';
const BASE_URL = 'https://assessment.ksensetech.com/api';

async function fetchPatients(page = 1, limit = 20) {
  try {
    const response = await fetch(`${BASE_URL}/patients?page=${page}&limit=${limit}`, {
      headers: { 'x-api-key': API_KEY },
      method: 'GET'
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    return response.json();
  } catch (error) {
    console.error('Fetch error:', error.message);
    throw error;
  }
}

function calculateRiskScore(patient) {
  let bpScore = 0, tempScore = 0, ageScore = 0;

  // Blood Pressure Risk
  if (patient.blood_pressure) {
    const [systolic, diastolic] = patient.blood_pressure.split('/').map(Number);
    if (isNaN(systolic) || isNaN(diastolic) || systolic < 0 || diastolic < 0) {
      bpScore = 0; // Invalid/Missing Data
    } else {
      if (systolic < 120 && diastolic < 80) bpScore = 0; // Normal
      else if ((systolic >= 120 && systolic <= 129) && diastolic < 80) bpScore = 1; // Elevated
      else if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) bpScore = 2; // Stage 1
      else if (systolic >= 140 || diastolic >= 90) bpScore = 3; // Stage 2
    }
  } else {
    bpScore = 0; // Missing data
  }

  // Temperature Risk
  if (typeof patient.temperature === 'number' && !isNaN(patient.temperature)) {
    if (patient.temperature >= 101.0) tempScore = 2; // High Fever
    else if (patient.temperature >= 99.6 && patient.temperature < 101.0) tempScore = 1; // Low Fever
    else tempScore = 0; // Normal
  } else {
    tempScore = 0; // Invalid/Missing Data
  }

  // Age Risk
  if (typeof patient.age === 'number' && !isNaN(patient.age)) {
    if (patient.age > 65) ageScore = 2; // Over 65
    else if (patient.age >= 40 && ageScore <= 65) ageScore = 1; // 40-65
    else ageScore = 0; // Under 40
  } else {
    ageScore = 0; // Invalid/Missing Data
  }

  return { bpScore, tempScore, ageScore, totalScore: bpScore + tempScore + ageScore };
}

async function processAllPatients() {
  let allPatients = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    try {
      const data = await fetchPatients(page);
      allPatients = allPatients.concat(data.data);
      hasNext = data.pagination.hasNext;
      page++;
      if (hasNext) await new Promise(resolve => setTimeout(resolve, 1000)); // Delay to avoid rate limiting
    } catch (error) {
      console.error(`Error on page ${page}:`, error.message);
      break;
    }
  }

  const results = {
    high_risk_patients: [],
    fever_patients: [],
    data_quality_issues: []
  };

  allPatients.forEach(patient => {
    const { totalScore, tempScore } = calculateRiskScore(patient);

    // High-Risk Patients (total risk score >= 4)
    if (totalScore >= 4) {
      results.high_risk_patients.push(patient.patient_id);
    }

    // Fever Patients (temperature >= 99.6°F)
    if (tempScore > 0) {
      results.fever_patients.push(patient.patient_id);
    }

    // Data Quality Issues (invalid/missing BP, Age, or Temp)
    if (!patient.blood_pressure || !patient.age || typeof patient.temperature !== 'number' || isNaN(patient.temperature)) {
      results.data_quality_issues.push(patient.patient_id);
    }
  });

  return results;
}

async function submitResults(results) {
  try {
    const response = await fetch(`${BASE_URL}/submit-assessment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(results)
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    console.log('Submission Results:', data);
    return data;
  } catch (error) {
    console.error('Submission error:', error.message);
    throw error;
  }
}

(async () => {
  try {
    const results = await processAllPatients();
    await submitResults(results);
  } catch (error) {
    console.error('Overall error:', error.message);
  }
})();
