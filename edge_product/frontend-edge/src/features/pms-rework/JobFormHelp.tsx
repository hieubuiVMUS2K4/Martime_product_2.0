import { translateMessage as tx, useMessageLocale } from '@/i18n/messages'
import { useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { Modal } from './ui'

const getGuides = () => ({
  information: {
    title: tx("pmsRework.jobInformation"),
    intro: tx("pmsRework.thisFormDefinesAMaintenanceJobAWO"),
    fields: [
      [tx("pmsRework.jobCodeRequired"), tx("pmsRework.aRequiredUniqueJobCodeIncludingAgainstSoft")],
      [tx("pmsRework.jobNameRequired"), tx("pmsRework.aClearNameForExampleInspectAndClean")],
      [tx("pmsRework.equipment"), tx("pmsRework.searchByNameOrCodeAndSelectA")],
      [tx("pmsRework.maintenanceType"), tx("pmsRework.periodicDryDockOnDemandOrPerVoyage")],
      [tx("pmsRework.priority"), tx("pmsRework.lowNormalHighOrCriticalIndicatesImportanceIt")],
      [tx("pmsRework.sourceWorkCode"), tx("pmsRework.aReferenceCodeFromExcelManufacturerDocumentationOr")],
      [tx("pmsRework.instructions"), tx("pmsRework.requiredWorkMethodsTechnicalRequirementsAndPrecautionsRecord")],
    ],
  },
  cycle: {
    title: tx("pmsRework.intervalAndInitialBaseline"),
    intro: tx("pmsRework.theInitialBaselineIsOnlyAReferenceFor"),
    fields: [
      [tx("pmsRework.calculateIntervalBy"), tx("pmsRework.calendarUsesDaysMonthsYearsRunningHoursUses")],
      [tx("pmsRework.calendarInterval"), tx("pmsRework.theIntervalBetweenMaintenanceActivitiesSuchAs3")],
      [tx("pmsRework.initialBaselineVesselTime"), tx("pmsRework.theReferenceDateAndTimeInTheVessel")],
      [tx("pmsRework.runningHoursInterval"), tx("pmsRework.theNumberOfOperatingHoursBetweenMaintenanceActivities")],
      [tx("pmsRework.initialCounterBaseline"), tx("pmsRework.referenceRunningHoursNotTheIntervalA200")],
      [tx("pmsRework.baselineReferenceSource"), tx("pmsRework.evidenceUsedToSetTheBaselineEngineLog")],
      [tx("pmsRework.reasonForBaselineChange"), tx("pmsRework.explainChangesToAnExistingBaselineOptionalFor")],
      [tx("pmsRework.advanceWarningDays"), tx("pmsRework.daysRemainingBeforeAJobIsConsideredUpcoming")],
      [tx("pmsRework.advanceWarningRunningHours"), tx("pmsRework.runningHoursRemainingBeforeAJobIsConsidered")],
      [tx("pmsRework.issueWOWhen"), tx("pmsRework.upcomingReleaseFromTheWarningWindowDueWait")],
      [tx("pmsRework.automaticReleaseGenerateWOByInterval"), tx("pmsRework.enabledTheVesselIssuesEligibleWOsWhenThe")],
    ],
    note: tx("pmsRework.exampleBaseline0HoursInterval100HoursWarning"),
  },
  responsibility: {
    title: tx("pmsRework.responsibility"),
    intro: tx("pmsRework.jobOwnershipWOExecutionAssignmentAndApprovalPermission"),
    fields: [
      [tx("pmsRework.responsibleDepartment"), tx("pmsRework.selectDeckEngineCateringOrOtherFromThe")],
      [tx("pmsRework.responsibleRank"), tx("pmsRework.theRankResponsibleForTheJobSuchAs")],
      [tx("pmsRework.responsiblePerson"), tx("pmsRework.thePersonOverseeingTheJobNotAutomaticallyIts")],
      [tx("pmsRework.assignmentForEachWO"), tx("pmsRework.assignWhenWOIsIssuedTheOrderAwaits")],
      [tx("pmsRework.defaultAssignee"), tx("pmsRework.shownForPreassignmentAtIssueTimeTheSystem")],
    ],
  },
  checklist: {
    title: tx("pmsRework.checklistTemplate"),
    intro: tx("pmsRework.theChecklistIsCopiedIntoAWOWhen"),
    fields: [
      [tx("pmsRework.checkItem"), tx("pmsRework.theStepToPerformOrItemToInspect")],
      [tx("pmsRework.readingRequired"), tx("pmsRework.aReadingMustBeRecordedWhenCompletingThis")],
      [tx("pmsRework.unit"), tx("pmsRework.selectAMeasurementUnitFromTheListSuch")],
      ['Min / Max', tx("pmsRework.referenceRangeReadingsOutsideThisRangeAreMarked")],
      [tx("pmsRework.addItemDeleteItem"), tx("pmsRework.changeTheTemplateStepsForFutureWorkOrders")],
    ],
  },
})

export function JobFormHelp({ group }: { group: keyof ReturnType<typeof getGuides> }) {
  useMessageLocale()

  const [open, setOpen] = useState(false), guide = getGuides()[group]
  return <><button type="button" aria-label={tx("pmsRework.help", { p0: guide.title })} title={tx("pmsRework.explainFields", { p0: guide.title })} onClick={() => setOpen(true)} className="inline-flex shrink-0 rounded p-0.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"><CircleAlert size={16} aria-hidden="true" /></button>
    {open && <Modal title={tx("pmsRework.help215", { p0: guide.title })} onClose={() => setOpen(false)}><div className="mx-auto max-w-4xl"><p className="mb-4 rounded border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-slate-700">{guide.intro}</p><dl className="divide-y divide-gray-200 rounded border border-gray-200">{guide.fields.map(([name, text]) => <div key={name} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-5"><dt className="text-sm font-medium text-slate-800">{name}</dt><dd className="text-sm leading-6 text-slate-600">{text}</dd></div>)}</dl>{'note' in guide && <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-slate-700"><h3 className="mb-1 font-medium">{tx("pmsRework.deadlineAndWOReleaseExamples")}</h3>{guide.note}</div>}</div></Modal>}
  </>
}
