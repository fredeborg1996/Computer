using System.Text.Json;

namespace Sigma.Core;

public sealed class Estimate
{
    public string Name { get; set; } = "Ny kalkulation";
    public List<EstimateLine> Lines { get; set; } = [];

    public decimal TotalCost => Lines.Sum(line => line.TotalCost);
    public decimal TotalSales => Lines.Sum(line => line.TotalSales);

    public static Estimate FromSigmaProject(SigmaProject project) => new()
    {
        Name = project.Name,
        Lines = Flatten(project.Components).Select(component => new EstimateLine
        {
            Position = component.Number,
            Text = component.Name,
            Unit = component.Unit,
            // Original Sigma prices may be calculated from nested resources. Import text only.
            Quantity = 1,
        }).ToList(),
    };

    private static IEnumerable<SigmaComponent> Flatten(IEnumerable<SigmaComponent> components)
    {
        foreach (var component in components)
        {
            yield return component;
            foreach (var child in Flatten(component.Children))
                yield return child;
        }
    }

    public static Estimate Load(string path)
    {
        var estimate = JsonSerializer.Deserialize<Estimate>(File.ReadAllText(path))
            ?? throw new InvalidDataException("Kalkulationsfilen er tom.");
        if (estimate.Lines is null || estimate.Lines.Count > 100_000)
            throw new InvalidDataException("Ugyldigt antal kalkulationslinjer.");
        return estimate;
    }

    public void Save(string path)
    {
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(path, json);
    }
}

public sealed class EstimateLine
{
    public string Position { get; set; } = "";
    public string Text { get; set; } = "";
    public string Unit { get; set; } = "";
    public decimal Quantity { get; set; } = 1;
    public decimal CostUnitPrice { get; set; }
    public decimal SalesUnitPrice { get; set; }
    public decimal TotalCost => Math.Round(Quantity * CostUnitPrice, 2, MidpointRounding.AwayFromZero);
    public decimal TotalSales => Math.Round(Quantity * SalesUnitPrice, 2, MidpointRounding.AwayFromZero);
}
