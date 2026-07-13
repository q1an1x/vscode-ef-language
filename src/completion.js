'use strict';

function isChineseLabel(label) {
  return /\p{Script=Han}/u.test(label);
}

function selectCompletionLabels(labels, language = 'chinese') {
  if (language === 'bilingual') return [...labels];
  const wantChinese = language !== 'english';
  return labels.filter(label => isChineseLabel(label) === wantChinese);
}

module.exports = { isChineseLabel, selectCompletionLabels };
