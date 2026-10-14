namespace Sigma.Core;

public sealed record SigmaComponent(
    string Name,
    string Number,
    string Unit,
    string Quantity,
    string UnitPrice,
    string CostPrice,
    string SalesPrice,
    IReadOnlyList<SigmaComponent> Children)
{
    public string UnitSalesPrice { get; init; } = "";
    public string Position { get; init; } = "";
}

public sealed record SigmaProject(
    string Name,
    string? ProjectNumber,
    string? SigmaVersion,
    string FileSaveVersion,
    IReadOnlyList<SigmaComponent> Components)
{
    public int ComponentCount => Count(Components);

    private static int Count(IEnumerable<SigmaComponent> components) =>
        components.Sum(component => 1 + Count(component.Children));
}
