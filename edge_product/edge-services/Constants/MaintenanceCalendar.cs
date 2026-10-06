using MaritimeEdge.Models;

namespace MaritimeEdge.Constants;

public static class MaintenanceCalendar
{
    public static bool HasInterval(MaintenanceSchedule schedule) =>
        schedule.IntervalDays > 0 || schedule.IntervalMonths > 0 || schedule.IntervalYears > 0;

    public static DateTime AddInterval(MaintenanceSchedule schedule, DateTime start) =>
        schedule.IntervalYears > 0 ? start.AddYears(schedule.IntervalYears.Value) :
        schedule.IntervalMonths > 0 ? start.AddMonths(schedule.IntervalMonths.Value) :
        start.AddDays(schedule.IntervalDays ?? throw new InvalidOperationException("Missing calendar interval"));

    public static DateTime AdvanceTo(MaintenanceSchedule schedule, DateTime due, DateTime boundary, out int count)
    {
        if (!HasInterval(schedule)) throw new InvalidOperationException("Missing positive calendar interval");
        count = 0;
        var next = due;
        while (next.Date < boundary.Date)
        {
            count++;
            next = schedule.IntervalYears > 0 ? due.AddYears(checked(count * schedule.IntervalYears.Value)) :
                schedule.IntervalMonths > 0 ? due.AddMonths(checked(count * schedule.IntervalMonths.Value)) :
                due.AddDays((double)count * (schedule.IntervalDays ?? throw new InvalidOperationException("Missing calendar interval")));
        }
        return next;
    }
}
