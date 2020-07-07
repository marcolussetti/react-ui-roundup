import {
  append,
  chain,
  filter,
  includes,
  indexBy,
  intersperse,
  map,
  pipe,
  pluck,
  prop,
  reject,
  sortBy,
  update,
  values,
  whereEq,
} from 'ramda';
import { compact, concatAll } from 'ramda-adjunct';
import { componentInfo } from '../components';
import { frameworks, frameworkInfo } from '../frameworks';
import { writeFile } from 'fs';
import { lines, h1, h2, link, p, table, website, criteria, quote, inlineCode, websiteHref } from './utils';
import { removeProtocol, getRepoInfo, noValue, toStablePairs, issueURL } from '../utils';
import { Component, Framework } from '../entities';

const pleaseFileIssue = link({
  text: 'Please file an issue',
  href: issueURL,
});

const headerMarkdown = lines([
  h1('React UI Roundup'),
  p('Are you a frontend developer or designer?  Do you wish you had a one-stop-shop you could go to see the various implementations of common components?  If so - React UI Roundup is for you!'),
  p(`I decided to make this project ${link({ href: 'https://github.com/mui-org/material-ui/issues/18094', text: 'while contributing an Alert component to material-ui' })}. While thinking about that component, it was HUGELY helpful to review other implementations from everything from feature set, DOM structure, CSS usage, theming integration, prop naming, and more. I wanted something where I could stand back at a distance and look at many high-quality implementations of a similar component while I researched - so I made this project.`),
  p(`An even more better version of this exact document is available at ${website}.  It has special "Open All" buttons that allow you to open every link in a table with one click!  Also, the Framework Statistics section on the website is always up to date since it pulls the data in realtime when you load the page.`),
])

const howToMakeAChange = lines([
  h1('How to Make a Change'),
  p(`The README.md and website are both autogenerated from the same source input files.  For convenience, there is exactly one file for each project that has all the information for that project, located in the ${link({ href: 'https://github.com/dimitropoulos/react-ui-roundup/tree/master/frameworks', text: inlineCode('frameworks directory') })}.  To update any given data point, simply make a change to one of those files and run ${inlineCode('yarn generate')}.`)
])

const frameworksSectionMarkdown = (repoInfo: any) => lines([
  h2('Framework Statistics'),
  table({
    headers: [
      'Name',
      'Homepage',
      'Repository',
      'Stars',
      'Forks',
      'Issues',
      'License',
    ],
    rows: map(({ frameworkName, frameworkHomepage, repoURL }) => [
      frameworkName,
      link({ text: removeProtocol(frameworkHomepage), href: frameworkHomepage }),
      link({ text: removeProtocol(repoURL).replace(/github\.com\//, ''), href: repoURL }),
      repoInfo[repoURL]?.stargazers_count?.toLocaleString() ?? noValue,
      repoInfo[repoURL]?.forks_count?.toLocaleString() ?? noValue,
      repoInfo[repoURL]?.open_issues_count?.toLocaleString() ?? noValue,
      repoInfo[repoURL]?.license?.name?.replace(/ License/, '') ?? noValue,
    ], frameworks),
  }),
  quote(`all of the above statistics were last updated ${new Date().toUTCString()}.  For real-time data, ${link({ href: websiteHref, text: 'see the website' })}.`),
]);

const frameworkFeaturesSectionMarkdown = lines([
  h2('Framework Features'),
  criteria(map(({ name, criteria }) => [name, criteria], frameworkInfo)),
  table({
    headers: [
      'Name',
      ...pluck('name', frameworkInfo),
    ],
    rows: map(({ frameworkName, frameworkFeaturesById }) => [
      frameworkName,
      ...map(({ toMarkdown, featureId }) => (
        // @ts-expect-error
        toMarkdown(frameworkFeaturesById[featureId])
      ), frameworkInfo),
    ], frameworks),
  }),
]);

const frameworksMarkdown = (repoInfo: any) => lines([
  h1('Frameworks'),
  frameworksSectionMarkdown(repoInfo),
  frameworkFeaturesSectionMarkdown,
]);

type EnhancedComponent = Component & Pick<Framework, 'frameworkName' | 'frameworkId'>;

const componentsMarkdown = lines([
  h1('Components'),
  ...chain(({ componentId, cannonicalName, description, indefiniteArticle, optionsById }) => {
    const optionsArray = pipe(
      values,
      sortBy(prop('name')),
    )(optionsById);

    const headers = [
      'Framework',
      'Name',
      ...pluck('name', optionsArray),
    ];

    const enhancedComponents: EnhancedComponent[] = chain(({ components, frameworkId, frameworkName }) => (
      map(component => ({
        ...component,
        frameworkId,
        frameworkName
      }), components)
    ), frameworks);

    const rows = pipe(
      // @ts-expect-error
      filter(whereEq({ componentId })),
      map(({ componentName, frameworkName, componentURL, options }) => [
        frameworkName,
        link({ text: componentName, href: componentURL }),
        ...map(({ optionId, toMarkdown }) => toMarkdown(options[optionId]), optionsArray),
      ]),
      // @ts-expect-error
    )(enhancedComponents) as string[][];

    const missingFrameworks = pipe(
      filter(whereEq({ componentId })),
      // @ts-expect-error
      pluck('frameworkId'),
      (frameworkIds: string[]) => reject(
        framework => includes(framework.frameworkId, frameworkIds),
        frameworks,
      ),
      map(({ frameworkName, repoURL }) => (
        link({ text: frameworkName, href: repoURL })
      )),
      intersperse(', '),
      (elements: string[]) => {
        switch (elements.length) {
          case 0:
            return [];

          case 1:
            return elements;

          case 3:
            return update(1, ' and ', elements)

          default:
            return update(elements.length - 2, ', and ', elements);
        }
      },
      (elements: string[]) => elements.length > 0 ? append(
        ` appear${elements.length === 1 ? 's' : ''} to be missing ${indefiniteArticle} ${cannonicalName} component. ${pleaseFileIssue} if one now exists.\n`,
        elements,
      ) : [],
      concatAll,
      line => line && line.length > 0 ? quote(line) : '',
      // @ts-expect-error
    )(enhancedComponents)

    return [
      h2(cannonicalName),
      p(typeof description === 'string' ? description : description.markdown),
      criteria(map(([key, value]) => (
        [value.name, value.criteria]
      ), toStablePairs(optionsById))),
      table({
        headers,
        rows,
      }),
      missingFrameworks,
    ];
  }, componentInfo),
]);

const fetchAll = async () => {
  const repoInfo = await Promise.all(
    map(({ repoURL }) => getRepoInfo(repoURL), frameworks)
  );

  const readme = lines([
    headerMarkdown,
    frameworksMarkdown(indexBy(prop('html_url'), compact(repoInfo))),
    componentsMarkdown,
    howToMakeAChange,
  ]);

  writeFile('README.md', readme, error => {
    if (error) {
      return console.error(error);
    }
  });
};

fetchAll();
