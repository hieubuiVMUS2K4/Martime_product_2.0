using System.ComponentModel.DataAnnotations.Schema;

namespace ProductApi.Models;

[Table("shore_module_settings")]
public class ShoreModuleSettings
{
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int Id { get; set; }
    public string DisabledModulesJson { get; set; } = "[]";
    public int Version { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string UpdatedBy { get; set; } = "";
}
