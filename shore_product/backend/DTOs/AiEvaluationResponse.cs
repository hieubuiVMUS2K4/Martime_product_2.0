namespace ProductApi.DTOs
{
    public class AiEvaluationResponse
    {
        public string Status { get; set; } = "Normal";
        public string ContentVi { get; set; } = string.Empty;
    }

    public class ShipMetricsDto
    {
        public DateTime ReportDate { get; set; }
        public double SeaTemperature { get; set; }
        public double FuelConsumption { get; set; }
        public double Rpm { get; set; }
        public double Speed { get; set; }
    }
}
