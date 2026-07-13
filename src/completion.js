'use strict';

const PINYIN_ALIASES = {
  '类库': ['leiku', 'lk'], '类': ['lei', 'l'], '枚举': ['meiju', 'mj'], '接口': ['jiekou', 'jk'],
  '友好名称': ['youhaomingcheng', 'yhmc'], '开始': ['kaishi', 'ks'], '循环': ['xunhuan', 'xh'],
  '计次循环': ['jicixunhuan', 'jcxh'], '遍历循环': ['bianlixunhuan', 'blxh'], 'C循环': ['cxunhuan', 'cxh'],
  '到循环尾': ['daoxunhuanwei', 'dxhw'], '跳出': ['tiaochu', 'tc'], '循环尾': ['xunhuanwei', 'xhw'],
  '如果': ['ruguo', 'rg'], '又如': ['youru', 'yr'], '否则': ['fouze', 'fz'], '假如': ['jiaru', 'jr'],
  '为': ['wei', 'w'], '为其他': ['weiqita', 'wqt'], '返回': ['fanhui', 'fh'], '引入': ['yinru', 'yr'],
  '创建': ['chuangjian', 'cj'], '检查': ['jiancha', 'jc'], '是否定义': ['shifoudingyi', 'sfdy'],
  '真': ['zhen', 'z'], '假': ['jia', 'j'], '空': ['kong', 'k'], '本对象': ['benduixiang', 'bdx'],
  '基类': ['jilei', 'jl'], '公开': ['gongkai', 'gk'], '扩展': ['kuozhan', 'kz'], '私有': ['siyou', 'sy'],
  '隐藏': ['yincang', 'yc'], '静态': ['jingtai', 'jt'], '常量': ['changliang', 'cl'],
  '事件处理': ['shijianchuli', 'sjcl'], '属性': ['shuxing', 'sx'], '可为空': ['keweikong', 'kwk'],
  '最终': ['zuizhong', 'zz'], '扩展开始': ['kuozhankaishi', 'kzks'], '遍历方法': ['bianlifangfa', 'blff'],
  '类型转换': ['leixingzhuanhuan', 'lxzh'], '可访问父对象': ['kefangwenfuduixiang', 'kfwfdx'],
  '逻辑': ['luoji', 'lj'], '字节': ['zijie', 'zj'], '短整数': ['duanzhengshu', 'dzs'],
  '整数': ['zhengshu', 'zs'], '长整数': ['changzhengshu', 'czs'], '小数': ['xiaoshu', 'xs'],
  '双精度小数': ['shuangjingduxiaoshu', 'sjdxs'], '文本': ['wenben', 'wb'], '字节集': ['zijieji', 'zjj'],
  '对象': ['duixiang', 'dx'], '动态类型': ['dongtaileixing', 'dtlx'], '弱类型': ['ruoleixing', 'rlx']
};

function isChineseLabel(label) {
  return /\p{Script=Han}/u.test(label);
}

function selectCompletionLabels(labels, language = 'chinese') {
  if (language === 'bilingual') return [...labels];
  const wantChinese = language !== 'english';
  return labels.filter(label => isChineseLabel(label) === wantChinese);
}

function pinyinAliases(label) {
  return PINYIN_ALIASES[label] || [];
}

function matchesPinyin(label, prefix) {
  const value = String(prefix || '').toLowerCase();
  return value.length > 0 && pinyinAliases(label).some(alias => alias.startsWith(value));
}

module.exports = { isChineseLabel, selectCompletionLabels, pinyinAliases, matchesPinyin };
