using System.Collections.ObjectModel;
using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Microsoft.Win32;
using Sigma.Core;

namespace Sigma.Desktop;

public partial class MainWindow : Window
{
    private Estimate estimate = new();
    private ObservableCollection<EstimateLine> lines = [];
    private string? savePath;
    private sealed record LibraryPane(TreeView Tree, DataGrid Grid);

    public MainWindow()
    {
        InitializeComponent();
        ShowEstimate("Ny lokal kalkulation");
    }

    private void ShowEstimate(string source)
    {
        lines = new ObservableCollection<EstimateLine>(estimate.Lines);
        LinesGrid.ItemsSource = lines;
        EstimateName.Text = estimate.Name;
        SourceInfo.Text = source;
        RefreshTotals();
    }

    private void CommitGrid()
    {
        LinesGrid.CommitEdit(DataGridEditingUnit.Cell, true);
        LinesGrid.CommitEdit(DataGridEditingUnit.Row, true);
        estimate.Name = EstimateName.Text;
        estimate.Lines = lines.ToList();
        RefreshTotals();
    }

    private void RefreshTotals()
    {
        Totals.Text = $"Samlet kostpris: {estimate.TotalCost:N2} kr.    Samlet salgspris: {estimate.TotalSales:N2} kr.";
        LinesGrid.Items.Refresh();
    }

    private void NewEstimate(object sender, RoutedEventArgs e)
    {
        estimate = new Estimate();
        savePath = null;
        ShowEstimate("Ny lokal kalkulation");
    }

    private void OpenEstimate(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog { Filter = "Kalkulation (*.skalk)|*.skalk" };
        if (dialog.ShowDialog(this) != true) return;
        try
        {
            estimate = Estimate.Load(dialog.FileName);
            savePath = dialog.FileName;
            ShowEstimate($"Lokal fil: {savePath}");
        }
        catch (Exception error) when (error is IOException or System.Text.Json.JsonException or InvalidDataException)
        {
            MessageBox.Show(this, error.Message, "Kunne ikke åbne kalkulationen");
        }
    }

    private void ImportSigma(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog { Filter = "Sigma-projekt (*.sit)|*.sit" };
        if (dialog.ShowDialog(this) != true) return;
        try
        {
            var project = SigmaProjectReader.Read(dialog.FileName);
            estimate = Estimate.FromSigmaProject(project);
            savePath = null;
            ShowEstimate($"Importeret struktur fra {dialog.FileName}. Priser/mængder er ikke importeret; originalen ændres ikke.");
        }
        catch (Exception error) when (error is IOException or InvalidDataException or System.Xml.XmlException)
        {
            MessageBox.Show(this, error.Message, "Kunne ikke importere Sigma-projektet");
        }
    }

    private void OpenLibrary(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog { Filter = "Sigma-bibliotek (*.sli)|*.sli" };
        if (dialog.ShowDialog(this) != true) return;
        try
        {
            var library = SigmaProjectReader.ReadLibrary(dialog.FileName);
            var tree = new TreeView { ItemsSource = library.Components, BorderThickness = new Thickness(0) };
            var template = new HierarchicalDataTemplate(typeof(SigmaComponent))
            {
                ItemsSource = new System.Windows.Data.Binding(nameof(SigmaComponent.Children)),
                VisualTree = new FrameworkElementFactory(typeof(TextBlock)),
            };
            template.VisualTree.SetBinding(TextBlock.TextProperty, new System.Windows.Data.Binding(nameof(SigmaComponent.Name)));
            tree.ItemTemplate = template;
            var grid = new DataGrid { AutoGenerateColumns = false, IsReadOnly = true,
                CanUserAddRows = false, HeadersVisibility = DataGridHeadersVisibility.Column,
                GridLinesVisibility = DataGridGridLinesVisibility.All, RowHeight = 28 };
            grid.Columns.Add(new DataGridTextColumn { Header = "Position", Binding = new System.Windows.Data.Binding(nameof(SigmaComponent.Position)), Width = 85 });
            grid.Columns.Add(new DataGridTextColumn { Header = "Tekst", Binding = new System.Windows.Data.Binding(nameof(SigmaComponent.Name)), Width = new DataGridLength(1, DataGridLengthUnitType.Star) });
            grid.Columns.Add(new DataGridTextColumn { Header = "Enhed", Binding = new System.Windows.Data.Binding(nameof(SigmaComponent.Unit)), Width = 80 });
            grid.Columns.Add(new DataGridTextColumn { Header = "Enhedspris", Binding = new System.Windows.Data.Binding(nameof(SigmaComponent.UnitPrice)), Width = 105 });
            grid.Columns.Add(new DataGridTextColumn { Header = "Salgs EP", Binding = new System.Windows.Data.Binding(nameof(SigmaComponent.UnitSalesPrice)), Width = 105 });
            tree.SelectedItemChanged += (_, args) =>
            {
                if (args.NewValue is SigmaComponent selected)
                    grid.ItemsSource = selected.Children.Count > 0 ? selected.Children : new[] { selected };
            };
            var layout = new Grid();
            layout.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(300) });
            layout.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            var sidebar = new Border { Child = tree, Padding = new Thickness(8), BorderBrush = System.Windows.Media.Brushes.LightGray,
                BorderThickness = new Thickness(0, 0, 1, 0) };
            layout.Children.Add(sidebar);
            Grid.SetColumn(grid, 1);
            layout.Children.Add(grid);
            var tab = new TabItem { Header = $"{library.Name} ({library.ComponentCount})", Content = layout, Tag = new LibraryPane(tree, grid) };
            LibraryTabs.Items.Add(tab);
            LibraryTabs.SelectedItem = tab;
        }
        catch (Exception error) when (error is IOException or InvalidDataException or System.Xml.XmlException)
        {
            MessageBox.Show(this, error.Message, "Kunne ikke åbne biblioteket");
        }
    }

    private void CopyLibraryItem(object sender, RoutedEventArgs e)
    {
        if (LibraryTabs.SelectedItem is not TabItem { Tag: LibraryPane pane }) return;
        var item = pane.Grid.SelectedItem as SigmaComponent ?? pane.Tree.SelectedItem as SigmaComponent;
        if (item is null) return;
        CommitGrid();
        // A library entry can derive its values from child resources and formulas.
        // Copy only explicitly stored unit prices, leaving the editable quantity at one.
        static decimal Parse(string value) => decimal.TryParse(value, NumberStyles.Float,
            CultureInfo.InvariantCulture, out var amount) ? amount : 0;
        lines.Add(new EstimateLine
        {
            Position = item.Position,
            Text = item.Name,
            Unit = item.Unit,
            Quantity = 1,
            CostUnitPrice = Parse(item.UnitPrice),
            SalesUnitPrice = Parse(item.UnitSalesPrice),
        });
        estimate.Lines = lines.ToList();
        RefreshTotals();
    }

    private void SaveEstimate(object sender, RoutedEventArgs e)
    {
        CommitGrid();
        var dialog = new SaveFileDialog { Filter = "Kalkulation (*.skalk)|*.skalk", DefaultExt = ".skalk", FileName = savePath is null ? estimate.Name : Path.GetFileName(savePath) };
        if (dialog.ShowDialog(this) != true) return;
        try
        {
            estimate.Save(dialog.FileName);
            savePath = dialog.FileName;
            SourceInfo.Text = $"Lokal fil: {savePath}";
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            MessageBox.Show(this, error.Message, "Kunne ikke gemme kalkulationen");
        }
    }

    private void AddLine(object sender, RoutedEventArgs e)
    {
        CommitGrid();
        lines.Add(new EstimateLine { Position = (lines.Count + 1).ToString() });
        estimate.Lines = lines.ToList();
        RefreshTotals();
    }

    private void RemoveLine(object sender, RoutedEventArgs e)
    {
        if (LinesGrid.SelectedItem is not EstimateLine line) return;
        lines.Remove(line);
        estimate.Lines = lines.ToList();
        RefreshTotals();
    }

    private void NameChanged(object sender, TextChangedEventArgs e)
    {
        if (estimate is not null) estimate.Name = EstimateName.Text;
    }

    private void LineEdited(object sender, DataGridCellEditEndingEventArgs e) =>
        Dispatcher.BeginInvoke(RefreshTotals, DispatcherPriority.Background);

    private void RowEdited(object sender, DataGridRowEditEndingEventArgs e) =>
        Dispatcher.BeginInvoke(RefreshTotals, DispatcherPriority.Background);
}
